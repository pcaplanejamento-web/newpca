import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { chaveColuna, colunasDe, colunasNosItens, nomeColuna, valorParaColuna } from "../src/lib/mesa-colunas-core.ts";
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
  const cs = {
    colunas: [
      { id: 1, entidade: "dfd" as const, nome: "A", nosItens: false },
      { id: 2, entidade: "item" as const, nome: "B", nosItens: false },
      { id: 3, entidade: "dfd" as const, nome: "C", nosItens: true },
    ],
    valores: {},
  };
  assert.deepEqual(colunasDe(cs, "item").map((c) => c.id), [2]);
  assert.deepEqual(colunasNosItens(cs).map((c) => c.id), [3], "só as de DFD marcadas aparecem também nos Itens");
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
  assert.equal((db.prepare("SELECT count(*) AS n FROM mesa_colunas WHERE chave <> 'centro de custo'").get() as { n: number }).n, 2, "sem a semeada pela 0175");
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

test("“também nos Itens”: gravado na criação, trocado depois, e só na coluna de DFD (driver D1 real)", async () => {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(process.cwd(), "drizzle", arq), "utf8"));
  const orm = drizzle(d1Sobre(db) as never, { schema }) as never as Parameters<typeof q.comandoCriarColuna>[0];
  await q.comandoCriarColuna(orm, "dfd", "Centro de Custo", null, true);
  await q.comandoCriarColuna(orm, "item", "Centro de Custo", null, true);
  const [dfd] = await q.consultaColunaPorNome(orm, "dfd", "centro de custo");
  const [item] = await q.consultaColunaPorNome(orm, "item", "centro de custo");
  assert.equal(dfd.nosItens, 1);
  assert.equal(item.nosItens, 0, "coluna de item nunca é “também nos Itens”");
  await q.comandoNosItens(orm, dfd.id, false);
  await q.comandoNosItens(orm, item.id, true);
  assert.equal((await q.consultaColunaPorNome(orm, "dfd", "Centro de Custo"))[0].nosItens, 0);
  assert.equal((await q.consultaColunaPorNome(orm, "item", "Centro de Custo"))[0].nosItens, 0, "o comando só vale para DFD");
});

test("migração 0174: tira só a coluna de DFD “Centro de Custo confere” (os valores caem pela cascata)", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const arqs = readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort();
  const i = arqs.indexOf("0174_remover_coluna_centro_custo_confere.sql");
  assert.ok(i > 0);
  for (const arq of arqs.slice(0, i)) db.exec(readFileSync(join(process.cwd(), "drizzle", arq), "utf8"));
  const criar = db.prepare("INSERT INTO mesa_colunas (entidade, nome, chave, nos_itens) VALUES (?, ?, ?, ?)");
  for (const [e, nome] of [["dfd", "Centro de Custo confere"], ["dfd", "Centro de Custo"], ["item", "Centro de Custo confere"]]) criar.run(e, nome, chaveColuna(nome), e === "dfd" ? 1 : 0);
  db.exec("INSERT INTO mesa_colunas_valores (coluna_id, alvo_id, valor) SELECT id, 1, 'x' FROM mesa_colunas");
  for (const arq of arqs.slice(i)) db.exec(readFileSync(join(process.cwd(), "drizzle", arq), "utf8"));
  const restantes = db.prepare("SELECT entidade, nome FROM mesa_colunas ORDER BY id").all();
  assert.deepEqual(JSON.parse(JSON.stringify(restantes)), [{ entidade: "dfd", nome: "Centro de Custo" }, { entidade: "item", nome: "Centro de Custo confere" }]);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM mesa_colunas_valores").get() as { n: number }).n, 2);
});

test("migração 0175: semeia a coluna de DFD “Centro de Custo” (também nos Itens) sem duplicar nem perder valores", () => {
  const arqs = readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort();
  const i = arqs.indexOf("0175_semear_coluna_centro_custo.sql");
  assert.ok(i > 0);
  const sql = (arq: string) => readFileSync(join(process.cwd(), "drizzle", arq), "utf8");
  // banco sem a coluna: nasce com nos_itens = 1
  const a = new DatabaseSync(":memory:");
  for (const arq of arqs) a.exec(sql(arq));
  a.exec(sql(arqs[i]));
  const linhas = a.prepare("SELECT nome, chave, nos_itens FROM mesa_colunas WHERE entidade = 'dfd'").all();
  assert.deepEqual(JSON.parse(JSON.stringify(linhas)), [{ nome: "Centro de Custo", chave: chaveColuna("Centro de Custo"), nos_itens: 1 }]);
  // coluna já criada pela automação (sem nos_itens): fica a mesma linha, com os valores
  const b = new DatabaseSync(":memory:");
  b.exec("PRAGMA foreign_keys = ON");
  for (const arq of arqs.slice(0, i)) b.exec(sql(arq));
  b.prepare("INSERT INTO mesa_colunas (entidade, nome, chave, nos_itens) VALUES ('dfd', 'Centro de Custo', ?, 0)").run(chaveColuna("Centro de Custo"));
  b.exec("INSERT INTO mesa_colunas_valores (coluna_id, alvo_id, valor) SELECT id, 7, 'PM RV, GGIM' FROM mesa_colunas");
  for (const arq of arqs.slice(i)) b.exec(sql(arq));
  assert.deepEqual(JSON.parse(JSON.stringify(b.prepare("SELECT nos_itens FROM mesa_colunas").all())), [{ nos_itens: 1 }]);
  assert.equal((b.prepare("SELECT COUNT(*) AS n FROM mesa_colunas_valores").get() as { n: number }).n, 1);
});
