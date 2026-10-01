import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { dfdProtocolos } from "../src/db/schema.ts";
import { comandoAtualizarSeResponsavel, comandosMesmoId } from "../src/lib/protocolo-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// Protocolo de MESMO Id e nº diferente (o mesmo processo renumerado) — pelos MESMOS builders do servidor, no driver
// `drizzle-orm/d1` REAL e DENTRO de `db.batch`, junto do upsert pelo nº (como o `iniciarProtocolo`). Requer --experimental-sqlite.

const DIR = join(process.cwd(), "drizzle");
function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

describe("protocolo de MESMO Id e nº diferente (builders no db.batch do D1)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  /** O que o `iniciarProtocolo` faz: acha os de mesmo Id (nº ≠) e o do nº novo; renumera/move + upsert num lote. */
  const protocolar = async (numero: string, idExterno: string, assunto: string) => {
    const ids = (db.prepare("SELECT id FROM dfd_protocolos WHERE id_externo = ? AND numero <> ?").all(idExterno, numero) as { id: number }[]).map((r) => r.id);
    const alvo = db.prepare("SELECT id FROM dfd_protocolos WHERE numero = ?").get(numero) as { id: number } | undefined;
    const upsert = orm
      .insert(dfdProtocolos)
      .values({ numero, idExterno, assunto })
      .onConflictDoUpdate({ target: dfdProtocolos.numero, set: { idExterno, assunto } })
      .returning({ id: dfdProtocolos.id });
    const cmds = comandosMesmoId(orm, numero, ids, alvo?.id ?? null);
    // biome-ignore lint/suspicious/noExplicitAny: a tupla exigida por db.batch() do Drizzle é inviável de anotar.
    const res = await orm.batch([...cmds, upsert] as unknown as [any, ...any[]]);
    return (res[cmds.length] as { id: number }[])[0].id;
  };
  const protocolos = () =>
    (db.prepare("SELECT id, numero, id_externo AS idExt, assunto, responsavel_id AS resp FROM dfd_protocolos ORDER BY id").all() as object[]).map((r) => ({ ...r }));
  const dfdsDe = (protocoloId: number) =>
    (db.prepare("SELECT numero FROM dfds WHERE protocolo_id = ? ORDER BY numero").all(protocoloId) as { numero: string }[]).map((r) => r.numero);

  before(() => {
    db = aplicarTudo();
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec("INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (7, 'Ana', 'ana@x', 'h')");
    db.exec("INSERT INTO dfd_protocolos (id, numero, id_externo, assunto, responsavel_id) VALUES (1, '100/2026', '555', 'INCLUSÃO', 7)");
    db.exec("INSERT INTO dfd_protocolos (id, numero, id_externo, assunto) VALUES (2, '200/2026', '777', 'INCLUSÃO')");
    db.exec("INSERT INTO dfd_protocolos (id, numero, id_externo, assunto) VALUES (3, '201/2026', NULL, 'ALTERAÇÃO')");
    for (const [n, p] of [["10", 1], ["11", 1], ["12", 1], ["20", 2], ["30", 3]] as const) {
      db.exec(`INSERT INTO dfds (numero, protocolo_id) VALUES ('${n}', ${p})`);
    }
  });

  it("sem outro protocolo no nº novo: RENUMERA o mesmo registro (DFDs e responsável seguem; nenhum órfão)", async () => {
    const id = await protocolar("101/2026", "555", "INCLUSÃO NOVA");
    assert.equal(id, 1);
    assert.deepEqual(protocolos()[0], { id: 1, numero: "101/2026", idExt: "555", assunto: "INCLUSÃO NOVA", resp: 7 });
    assert.deepEqual(dfdsDe(1), ["10", "11", "12"]);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM dfds WHERE protocolo_id IS NULL").get() as { n: number }).n, 0);
  });

  it("com outro protocolo já no nº novo: os DFDs do de mesmo Id passam a ele e o de mesmo Id sai", async () => {
    const id = await protocolar("201/2026", "777", "INCLUSÃO");
    assert.equal(id, 3);
    assert.deepEqual(dfdsDe(3), ["20", "30"]);
    assert.equal(protocolos().some((p) => (p as { id: number }).id === 2), false);
    assert.equal((db.prepare("SELECT id_externo AS i FROM dfd_protocolos WHERE id = 3").get() as { i: string }).i, "777");
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM dfds WHERE protocolo_id IS NULL").get() as { n: number }).n, 0);
  });

  it("sem protocolo de mesmo Id: nenhum comando (só o upsert)", () => {
    assert.deepEqual(comandosMesmoId(orm, "300/2026", [], null), []);
  });
});

describe("Responsável com trava otimista (duas pessoas assumindo ao mesmo tempo)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  before(() => {
    db = aplicarTudo();
    db.exec(
      "INSERT INTO usuarios (id, email, nome, senha_hash, role, status) VALUES (5, 'a@x.br', 'A', 'x', 'membro', 'ativo'), (6, 'b@x.br', 'B', 'x', 'membro', 'ativo')",
    );
    db.exec("INSERT INTO dfd_protocolos (id, numero) VALUES (1, '1/2026')");
    orm = drizzle(d1Sobre(db) as never, { schema });
  });
  const resp = () => (db.prepare("SELECT responsavel_id AS r FROM dfd_protocolos WHERE id = 1").get() as { r: number | null }).r;

  it("assumir o SEM responsável: a 1ª pessoa grava, a 2ª (que leu 'sem') não sobrescreve", async () => {
    const a = await comandoAtualizarSeResponsavel(orm, 1, { responsavelId: 5 }, null);
    const b = await comandoAtualizarSeResponsavel(orm, 1, { responsavelId: 6 }, null);
    assert.equal(a.length, 1);
    assert.equal(b.length, 0);
    assert.equal(resp(), 5);
  });

  it("soltar o seu só enquanto ainda é seu; outra pessoa não solta o de quem assumiu", async () => {
    assert.equal((await comandoAtualizarSeResponsavel(orm, 1, { responsavelId: null }, 6)).length, 0);
    assert.equal(resp(), 5);
    assert.equal((await comandoAtualizarSeResponsavel(orm, 1, { responsavelId: null }, 5)).length, 1);
    assert.equal(resp(), null);
  });

  it("os demais campos vão junto, na mesma trava", async () => {
    assert.equal((await comandoAtualizarSeResponsavel(orm, 1, { responsavelId: 6, assunto: "INCLUSÃO" }, null)).length, 1);
    const p = db.prepare("SELECT responsavel_id AS r, assunto AS a FROM dfd_protocolos WHERE id = 1").get() as { r: number; a: string };
    assert.deepEqual([p.r, p.a], [6, "INCLUSÃO"]);
  });
});
