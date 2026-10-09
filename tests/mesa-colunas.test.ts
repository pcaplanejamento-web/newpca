import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { chaveColuna, colunasDe, nomeColuna, valorParaColuna } from "../src/lib/mesa-colunas-core.ts";
import * as q from "../src/lib/mesa-colunas-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

test("núcleo: chave sem caixa/acento, nome limpo, valor ≤ 500 (vazio = apagar)", () => {
  assert.equal(chaveColuna("  Situação   na CENTI "), "situacao na centi");
  assert.equal(nomeColuna("  Situação​  Centi "), "Situação Centi");
  assert.equal(valorParaColuna("  "), null);
  assert.equal(valorParaColuna(null), null);
  assert.equal(valorParaColuna(12), "12");
  assert.equal(valorParaColuna({ a: 1 }), '{"a":1}');
  assert.equal(valorParaColuna("x".repeat(900))?.length, 500);
  assert.deepEqual(colunasDe({ colunas: [{ id: 1, entidade: "dfd", nome: "A" }, { id: 2, entidade: "item", nome: "B" }], valores: {} }, "item").map((c) => c.id), [2]);
});

test("builders: coluna única por entidade + nome; valores em lotes (≤ 100 parâmetros), troca e apaga (driver D1 real)", async () => {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(process.cwd(), "drizzle", arq), "utf8"));
  const orm = drizzle(d1Sobre(db) as never, { schema }) as never as Parameters<typeof q.comandoCriarColuna>[0];
  const lote = (c: unknown[]) => (orm as unknown as { batch: (c: unknown[]) => Promise<unknown> }).batch(c);
  await q.comandoCriarColuna(orm, "dfd", "Situação Centi", null);
  await q.comandoCriarColuna(orm, "dfd", "situacao centi", null);
  await q.comandoCriarColuna(orm, "item", "Situação Centi", null);
  const [col] = await q.consultaColunaPorNome(orm, "dfd", "SITUAÇÃO CENTI");
  assert.equal(col.nome, "Situação Centi");
  assert.equal((db.prepare("SELECT count(*) AS n FROM mesa_colunas").get() as { n: number }).n, 2);
  const valores = Array.from({ length: 70 }, (_, i) => ({ alvoId: i + 1, valor: `v${i}` }));
  const cmds = q.comandosGravarValores(orm, col.id, [...valores, { alvoId: 1, valor: "novo" }]);
  assert.equal(cmds.length, Math.ceil(70 / q.LOTE_VALORES));
  await lote(cmds);
  await lote(q.comandosGravarValores(orm, col.id, [{ alvoId: 2, valor: null }, { alvoId: 3, valor: "troca" }]));
  const linhas = db.prepare("SELECT alvo_id, valor FROM mesa_colunas_valores WHERE coluna_id = ? ORDER BY alvo_id").all(col.id) as { alvo_id: number; valor: string }[];
  assert.equal(linhas.length, 69);
  assert.equal(linhas[0].valor, "novo", "o mesmo registro no lote vale o último");
  assert.equal(linhas.find((l) => l.alvo_id === 3)?.valor, "troca");
  assert.ok(!linhas.some((l) => l.alvo_id === 2), "null apaga");
  db.exec(`DELETE FROM mesa_colunas WHERE id = ${col.id}`);
  assert.equal((db.prepare("SELECT count(*) AS n FROM mesa_colunas_valores").get() as { n: number }).n, 0, "excluir a coluna apaga os valores");
});
