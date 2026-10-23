import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { aparelhosDistintos, atalhoDeCaptura, duracaoAcesso, haQuanto, MAX_TEXTO_EVENTO, rotuloDispositivo, tempoNosUltimosDias, textoDoEvento, textoDuracaoAcesso } from "../src/lib/acessos-core.ts";
import { comandoAtividadeAcesso, comandoLimparEventos, comandoSaidaAcessos, comandosRegistrarAcesso, comandosRegistrarEvento, consultaAcessos, consultaEventos, MAX_ACESSOS } from "../src/lib/acessos-sql.ts";
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
    await orm.batch(comandosRegistrarAcesso(orm, { usuarioId: 2, em: "2026-10-01T00:00:00.000Z", canal: "senha", navegador: "Firefox", ip: null, aparelho: "zzzzzz", novo: false, sessao: "s2" }));
    for (let i = 0; i < MAX_ACESSOS + 5; i++) {
      const em = new Date(Date.UTC(2026, 9, 14, 0, i)).toISOString();
      await orm.batch(comandosRegistrarAcesso(orm, { usuarioId: 1, em, canal: i % 2 ? "google" : "senha", navegador: "Chrome no Windows", ip: "1.2.3.4", aparelho: "a1b2c3", novo: i === 0, sessao: `s1-${i}` }));
    }
    const lista = await consultaAcessos(orm, 1);
    assert.equal(lista.length, MAX_ACESSOS);
    assert.equal(lista[0].em, new Date(Date.UTC(2026, 9, 14, 0, MAX_ACESSOS + 4)).toISOString());
    assert.equal((await consultaAcessos(orm, 2)).length, 1); // a poda é por pessoa
    const u = db.prepare("SELECT ultimo_acesso_em AS u FROM usuarios WHERE id = 1").get() as { u: string };
    assert.equal(u.u, lista[0].em);
  });

  it("duração, texto do evento e atalhos de captura", () => {
    assert.deepEqual(duracaoAcesso({ em: "2026-10-14T10:00:00.000Z", saidaEm: "2026-10-14T12:05:00.000Z" }), { ms: 7_500_000, estimada: false });
    assert.deepEqual(duracaoAcesso({ em: "2026-10-14T10:00:00.000Z", ultimoEm: "2026-10-14T10:30:00.000Z" }), { ms: 1_800_000, estimada: true });
    assert.equal(duracaoAcesso({ em: "2026-10-14T10:00:00.000Z" }), null);
    assert.equal(textoDuracaoAcesso(30_000), "menos de 1 min");
    assert.equal(textoDuracaoAcesso(7_500_000), "2 h 05 min");
    const agora = Date.parse("2026-10-20T00:00:00Z");
    assert.equal(tempoNosUltimosDias([{ em: "2026-10-14T10:00:00.000Z", saidaEm: "2026-10-14T11:00:00.000Z" }, { em: "2026-01-01T10:00:00.000Z", saidaEm: "2026-01-01T11:00:00.000Z" }], agora), 3_600_000);
    const t = textoDoEvento("a".repeat(900));
    assert.equal(t.texto?.length, MAX_TEXTO_EVENTO);
    assert.equal(t.tamanho, 900);
    assert.equal(textoDoEvento("   ").texto, null);
    assert.equal(atalhoDeCaptura({ key: "PrintScreen", shiftKey: false, metaKey: false }), true);
    assert.equal(atalhoDeCaptura({ key: "s", shiftKey: true, metaKey: true }), true);
    assert.equal(atalhoDeCaptura({ key: "c", shiftKey: false, metaKey: true }), false);
  });

  it("atividade, saída e eventos no D1 real", async () => {
    const db = new DatabaseSync(":memory:");
    const dir = join(process.cwd(), "drizzle");
    for (const arq of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, arq), "utf8"));
    const orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec(`INSERT INTO usuarios (id, email, nome, senha_hash, status) VALUES (1, 'a@x', 'A', 'x', 'ativo')`);
    await orm.batch(comandosRegistrarAcesso(orm, { usuarioId: 1, em: "2026-10-14T10:00:00.000Z", canal: "senha", navegador: "Chrome", ip: null, aparelho: "a", novo: false, sessao: "abc" }));
    await orm.batch([comandoAtividadeAcesso(orm, "abc", "2026-10-14T10:40:00.000Z")]);
    let [a] = await consultaAcessos(orm, 1);
    assert.equal(a.ultimoEm, "2026-10-14T10:40:00.000Z");
    await orm.batch([comandoSaidaAcessos(orm, ["abc"], "2026-10-14T11:00:00.000Z", "sair")]);
    await orm.batch([comandoSaidaAcessos(orm, ["abc"], "2026-10-14T12:00:00.000Z", "inatividade")]); // a 1ª saída fica
    [a] = await consultaAcessos(orm, 1);
    assert.equal(a.saidaEm, "2026-10-14T11:00:00.000Z");
    assert.equal(a.saidaMotivo, "sair");
    const ev = { usuarioId: 1, tipo: "copia", rota: "/painel/mesa", tela: "Mesa", itens: "Protocolo 1/2026", texto: "x", tamanho: 1, origem: "navegador", navegador: "Chrome", ip: null };
    await orm.batch(comandosRegistrarEvento(orm, { ...ev, em: new Date().toISOString() }));
    await orm.batch(comandosRegistrarEvento(orm, { ...ev, em: "2020-01-01T00:00:00.000Z" }));
    assert.equal((await consultaEventos(orm, 1)).length, 2);
    await orm.batch([comandoLimparEventos(orm, Date.now())]);
    const restam = await consultaEventos(orm, 1);
    assert.equal(restam.length, 1);
    assert.equal(restam[0].itens, "Protocolo 1/2026");
  });
});
