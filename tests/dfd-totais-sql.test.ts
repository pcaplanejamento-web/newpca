import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { comandoApagarFaixaItens, comandoTotaisDfd } from "../src/lib/dfd-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// TOTAIS do DFD = os ITENS gravados (a regra única): os MESMOS builders do servidor, no driver `drizzle-orm/d1` REAL e
// DENTRO de `db.batch`. Requer --experimental-sqlite.

const DIR = join(process.cwd(), "drizzle");
function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

describe("totais do DFD pelos itens (comandoTotaisDfd no db.batch do D1)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  const totais = (id: number) => ({ ...(db.prepare("SELECT total_itens AS n, valor_total AS v FROM dfds WHERE id = ?").get(id) as { n: number | null; v: number | null }) });
  const itens = (id: number) => (db.prepare("SELECT sequencial AS s FROM dfd_itens WHERE dfd_id = ? ORDER BY sequencial").all(id) as { s: number }[]).map((r) => r.s);
  const item = (dfd: number, seq: number, vt: number | null) =>
    db.prepare("INSERT INTO dfd_itens (dfd_id, sequencial, item, valor_total) VALUES (?, ?, ?, ?)").run(dfd, seq, seq, vt);

  before(() => {
    db = aplicarTudo();
    orm = drizzle(d1Sobre(db) as never, { schema });
  });

  it("recalcula com os itens: soma com 4 casas (o TOTAL GERAL declarado não vale), contagem real", async () => {
    db.exec("INSERT INTO dfds (id, numero, total_itens, valor_total) VALUES (1, 'D1', 2, 999.99)");
    item(1, 1, 10.0049);
    item(1, 2, 20.0011);
    await orm.batch([comandoTotaisDfd(orm, 1)]);
    assert.deepEqual(totais(1), { n: 2, v: 30.006 });
  });

  it("sem valor (Σ ≤ 0) ⇒ NULL; sem itens ⇒ 0 itens e NULL — nunca estimado", async () => {
    db.exec("INSERT INTO dfds (id, numero, total_itens, valor_total) VALUES (2, 'D2', 1, 50), (3, 'D3', 3, 70)");
    item(2, 1, null);
    await orm.batch([comandoTotaisDfd(orm, 2), comandoTotaisDfd(orm, 3)]);
    assert.deepEqual(totais(2), { n: 1, v: null });
    assert.deepEqual(totais(3), { n: 0, v: null });
  });

  it("soCompleto: a importação pela metade mantém o declarado; com todos os itens, fecha pelos itens", async () => {
    db.exec("INSERT INTO dfds (id, numero, total_itens, valor_total) VALUES (4, 'D4', 3, 300)");
    item(4, 1, 100);
    item(4, 2, 100);
    await orm.batch([comandoTotaisDfd(orm, 4, { soCompleto: true })]);
    assert.deepEqual(totais(4), { n: 3, v: 300 }, "2 de 3: segue o declarado");
    item(4, 3, 99.99);
    await orm.batch([comandoTotaisDfd(orm, 4, { soCompleto: true })]);
    assert.deepEqual(totais(4), { n: 3, v: 299.99 });
  });

  it("o alvo pelo nº do DFD (o start-dfd, dentro do mesmo lote do upsert)", async () => {
    db.exec("INSERT INTO dfds (id, numero, total_itens, valor_total) VALUES (5, 'D5', 1, 1)");
    item(5, 1, 7.5);
    await orm.batch([comandoTotaisDfd(orm, sql`(SELECT id FROM dfds WHERE numero = ${"D5"})`, { soCompleto: true })]);
    assert.deepEqual(totais(5), { n: 1, v: 7.5 });
  });

  it("append em FAIXA: o retry do lote não duplica e um retry ATRASADO não apaga o lote seguinte", async () => {
    db.exec("INSERT INTO dfds (id, numero, total_itens) VALUES (6, 'D6', 6)");
    for (const s of [1, 2, 3, 4, 5, 6]) item(6, s, 1);
    // O lote 2 (itens 3–4) chega de novo DEPOIS do lote 3: só a faixa dele é regravada.
    await orm.batch([comandoApagarFaixaItens(orm, 6, 2, 4)]);
    assert.deepEqual(itens(6), [1, 2, 5, 6]);
    item(6, 3, 1);
    item(6, 4, 1);
    await orm.batch([comandoTotaisDfd(orm, 6, { soCompleto: true })]);
    assert.deepEqual(itens(6), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(totais(6), { n: 6, v: 6 });
  });
});
