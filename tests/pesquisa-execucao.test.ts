import assert from "node:assert/strict";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { casaLocal, linhasDaExecucao, pedeIndiceExecucao, resultadoEmpenho, type TuplaExecucao } from "../src/lib/pesquisa-core.ts";
import { consultaIndiceExecucao } from "../src/lib/pesquisa-execucao-sql.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

function banco() {
  const raw = bancoMigrado();
  raw.exec(
    "INSERT INTO orgaos (id, nome, sigla) VALUES (1, 'Prefeitura', 'PMRV'); INSERT INTO reparticoes (id, orgao_id, codigo, nome) VALUES (10, 1, 'SEMED', 'Educação'), (11, 1, 'SEMAD', 'Administração'); INSERT INTO empenho_cards (id, nome) VALUES (1, 'A'), (2, 'B')",
  );
  const ins = raw.prepare(
    "INSERT INTO empenhos (card_id, chave, ano, numero, data, fornecedor, cpf_cnpj, valor_empenhado, removido_em, orgao_id, reparticao_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
  );
  return { raw, db: drizzle(d1Sobre(raw) as never, { schema }), ins };
}

test("índice da execução: vigentes, no escopo, o mesmo registro em dois cards UMA vez (o do menor card), do mais recente", async () => {
  const b = banco();
  b.ins.run(1, "2025|PMRV|7", 2025, "7", "2025-03-01", "ACME LTDA", "11.111.111/0001-11", 100, null, 10);
  b.ins.run(2, "2025|PMRV|7", 2025, "7", "2025-03-01", "ACME LTDA", "11.111.111/0001-11", 100, null, 10);
  b.ins.run(1, "2026|PMRV|9", 2026, "9", "2026-01-05", "PAPELARIA SÃO JOÃO", null, 50.5, null, 10);
  b.ins.run(1, "2026|PMRV|10", 2026, "10", "2026-01-06", "REMOVIDO", null, 1, "2026-02-01", 10);
  b.ins.run(1, "2026|PMRV|11", 2026, "11", "2026-01-07", "OUTRA UNIDADE", null, 1, null, 11);
  const todos = await consultaIndiceExecucao(b.db, "empenho", null);
  const tuplas = JSON.parse(todos.texto) as TuplaExecucao[];
  assert.equal(todos.total, 3);
  assert.deepEqual(
    tuplas.map((t) => t[2]),
    ["11", "9", "7"],
  );
  const do7 = tuplas.find((t) => t[2] === "7");
  const id1 = (b.raw.prepare("SELECT id FROM empenhos WHERE card_id = 1 AND numero = '7'").get() as { id: number }).id;
  assert.equal(do7?.[0], id1);
  const so10 = JSON.parse((await consultaIndiceExecucao(b.db, "empenho", { unidades: [10], orgaos: [] })).texto) as TuplaExecucao[];
  assert.deepEqual(
    so10.map((t) => t[2]),
    ["9", "7"],
  );
  // vazio = "[]"
  assert.equal((await consultaIndiceExecucao(b.db, "pagamento", null)).texto, "[]");
});

test("índice da execução: as linhas casam pelo texto como o SQL e levam o MESMO resultado", () => {
  const linhas = linhasDaExecucao("empenho", [[5, 2026, "9", "Papelaria São João", "12.345.678/0001-90", 50.5, "2026-01-05"]]);
  assert.deepEqual(
    { id: linhas[0].id, rotulo: linhas[0].rotulo, href: linhas[0].href },
    (({ id, rotulo, href }) => ({ id, rotulo, href }))(resultadoEmpenho({ id: 5, ano: 2026, numero: "9", data: "2026-01-05", fornecedor: "Papelaria São João", valor: 50.5 })),
  );
  assert.ok(casaLocal("papelaria joao")(linhas[0]));
  assert.ok(casaLocal("12.345.678")(linhas[0]));
  assert.ok(!casaLocal("acme")(linhas[0]));
  const liq = linhasDaExecucao("liquidacao", [[3, 2026, null, "9", "Credor X", null, 10, null]]);
  assert.equal(liq[0].href, "/painel/liquidacoes?abrir=3");
  assert.ok(casaLocal("credor")(liq[0]));
  const pag = linhasDaExecucao("pagamento", [[4, 2026, "OP-1", "9", "Credor Y", null, 10, "2026-02-01"]]);
  assert.equal(pag[0].href, "/painel/pagamentos?abrir=4");
  assert.ok(pedeIndiceExecucao("acme"));
  assert.ok(!pedeIndiceExecucao("12345"));
  assert.ok(!pedeIndiceExecucao("ac"));
});
