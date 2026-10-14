import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { aparelhosDistintos, haQuanto, rotuloDispositivo } from "../src/lib/acessos-core.ts";
import { comandosRegistrarAcesso, consultaAcessos, MAX_ACESSOS } from "../src/lib/acessos-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// HISTÓRICO DE ACESSO: rótulos puros + a gravação no driver `drizzle-orm/d1` REAL (lote atômico, poda, último acesso).

describe("histórico de acesso", () => {
  it("rótulos", () => {
    const agora = Date.parse("2026-10-14T12:00:00Z");
    assert.equal(haQuanto(null, agora), "nunca");
    assert.equal(haQuanto("2026-10-14T11:59:30Z", agora), "agora");
    assert.equal(haQuanto("2026-10-14T11:30:00Z", agora), "há 30 min");
    assert.equal(haQuanto("2026-10-14T09:00:00Z", agora), "há 3 h");
    assert.equal(haQuanto("2026-10-13T10:00:00Z", agora), "há 1 dia");
    assert.equal(rotuloDispositivo({ navegador: "Chrome no Windows", aparelho: "a1b2c3" }), "Chrome no Windows · aparelho A1B2C3");
    assert.equal(aparelhosDistintos([{ aparelho: "a" }, { aparelho: "b" }, { aparelho: "a" }]), 2);
  });

  it("grava, poda além do teto e marca o último acesso", async () => {
    const db = new DatabaseSync(":memory:");
    const dir = join(process.cwd(), "drizzle");
    for (const arq of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, arq), "utf8"));
    const orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec(`INSERT INTO usuarios (id, email, nome, senha_hash, status) VALUES (1, 'a@x', 'A', 'x', 'ativo'), (2, 'b@x', 'B', 'x', 'ativo')`);
    await orm.batch(comandosRegistrarAcesso(orm, { usuarioId: 2, em: "2026-10-01T00:00:00.000Z", canal: "senha", navegador: "Firefox", ip: null, aparelho: "zzzzzz", novo: false }));
    for (let i = 0; i < MAX_ACESSOS + 5; i++) {
      const em = new Date(Date.UTC(2026, 9, 14, 0, i)).toISOString();
      await orm.batch(comandosRegistrarAcesso(orm, { usuarioId: 1, em, canal: i % 2 ? "google" : "senha", navegador: "Chrome no Windows", ip: "1.2.3.4", aparelho: "a1b2c3", novo: i === 0 }));
    }
    const lista = await consultaAcessos(orm, 1);
    assert.equal(lista.length, MAX_ACESSOS);
    assert.equal(lista[0].em, new Date(Date.UTC(2026, 9, 14, 0, MAX_ACESSOS + 4)).toISOString());
    assert.equal((await consultaAcessos(orm, 2)).length, 1); // a poda é por pessoa
    const u = db.prepare("SELECT ultimo_acesso_em AS u FROM usuarios WHERE id = 1").get() as { u: string };
    assert.equal(u.u, lista[0].em);
  });
});
