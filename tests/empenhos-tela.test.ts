import assert from "node:assert/strict";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import {
  ANO_TODOS,
  anoEscolhido,
  chaveEscopoEmpenhos,
  EMPENHOS_POR_PEDACO,
  empenhoNoEscopo,
  empenhosDoPacote,
  juntarAnos,
  type PacoteEmpenhos,
  resumoEmpenhos,
} from "../src/lib/empenhos-tela-core.ts";
import { consultaAnosEmpenhos, consultaVersaoEmpenhos, textoPacoteEmpenhos } from "../src/lib/empenhos-tela-sql.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

function banco() {
  const raw = bancoMigrado();
  raw.exec("INSERT INTO orgaos (id, nome, sigla) VALUES (1, 'Prefeitura', 'PMRV'), (2, 'Fundo', 'FMS'); INSERT INTO reparticoes (id, orgao_id, codigo, nome) VALUES (10, 1, 'SEMED', 'Educação'), (11, 1, 'SEMAD', 'Administração'); INSERT INTO empenho_cards (id, nome) VALUES (1, 'Empenhos'), (2, 'Outro')");
  const db = drizzle(d1Sobre(raw) as never, { schema });
  const ins = raw.prepare(
    `INSERT INTO empenhos (card_id, chave, ano, numero, data, orgao_gestor, fornecedor, cpf_cnpj, elemento, fonte, valor_empenhado, valor_anulado, valor_liquidado, valor_pago, saldo_pagar, removido_em, orgao_id, reparticao_id)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  return { raw, db, ins };
}

/** O pacote como a rota o devolve (o texto do banco, lido). */
async function pacote(b: ReturnType<typeof banco>, ano: number, removidos = false): Promise<PacoteEmpenhos> {
  const t = await textoPacoteEmpenhos(b.db, 1, ano, removidos);
  assert.ok(t != null);
  return JSON.parse(t) as PacoteEmpenhos;
}

test("tela de empenhos: o pacote compacto do banco volta IGUAL ao que está gravado (nulos, aspas, acentos, removidos)", async () => {
  const b = banco();
  b.ins.run("2026|PMRV|1", 2026, "1", "2026-01-02", "PMRV", 'ACME "LTDA"', "1.234/0001-00", "3.3.90.30 - MATERIAL", null, 100.5, 0, 50, 50, 50.5, null, 1, null);
  b.ins.run("2026|FMS|2", 2026, "2", null, "FMS", "JOÃO Ç", null, "3.3.90.30 - MATERIAL", "1.07 - SUS", 3042, 10, 0, 0, 3032, null, 1, null);
  b.ins.run("2026|FMS|3", 2026, "3", "2026-01-02", "FMS", null, null, null, "1.07 - SUS", 7, 0, 7, 7, 0, "2026-05-01", 1, null);
  b.ins.run("2025|PMRV|9", 2025, "9", "2025-12-30", "PMRV", "X", null, null, null, 1, 0, 0, 0, 1, null, 1, null);

  const p = await pacote(b, 2026);
  assert.equal(p.n, 2);
  const e = empenhosDoPacote(p);
  assert.deepEqual(
    e.map((x) => [x.numero, x.data, x.orgaoGestor, x.fornecedor, x.cpfCnpj, x.elemento, x.fonte, x.valorEmpenhado, x.saldoPagar]),
    [
      ["1", "2026-01-02", "PMRV", 'ACME "LTDA"', "1.234/0001-00", "3.3.90.30 - MATERIAL", null, 100.5, 50.5],
      ["2", null, "FMS", "JOÃO Ç", null, "3.3.90.30 - MATERIAL", "1.07 - SUS", 3042, 3032],
    ],
  );
  // O texto repetido vai UMA vez no dicionário.
  assert.equal(p.dic.elemento?.length, 1);

  const rem = empenhosDoPacote(await pacote(b, 2026, true));
  assert.deepEqual(rem.map((x) => x.numero), ["3"]);
  assert.deepEqual(empenhosDoPacote(await pacote(b, 2024)), []);

  const anos = await consultaAnosEmpenhos(b.db, 1);
  assert.deepEqual(anos.map((a) => [a.ano, a.n, a.removidos]), [[2026, 2, 1], [2025, 1, 0]]);
  assert.equal(anos[0].soma, 3142.5);

  const r = resumoEmpenhos(e);
  assert.deepEqual(r, { n: 2, empenhado: 3142.5, anulado: 10, liquidado: 50, pago: 50, aPagar: 3082.5 });
});

test("tela de empenhos: vários PEDAÇOS — nenhum empenho some nem repete, da data MAIS RECENTE à mais antiga", async () => {
  const b = banco();
  const total = EMPENHOS_POR_PEDACO * 2 + 37;
  b.raw.exec("BEGIN");
  for (let i = 1; i <= total; i++) b.ins.run(`2026|O${i % 7}|${i}`, 2026, String(i), `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, `O${i % 7}`, `F${i % 500}`, null, `E${i % 41}`, `S${i % 60}`, i, 0, 0, 0, i, null, 1, null);
  b.raw.exec("COMMIT");
  const e = empenhosDoPacote(await pacote(b, 2026));
  assert.equal(e.length, total);
  assert.deepEqual(
    e.map((x) => Number(x.numero)).sort((a, b) => a - b),
    Array.from({ length: total }, (_, i) => i + 1),
  );
  // A ordem natural do pacote: data decrescente e, no mesmo dia, o id (= o número aqui) decrescente.
  for (let i = 1; i < e.length; i++) {
    const a = e[i - 1];
    const c = e[i];
    assert.ok((a.data ?? "") > (c.data ?? "") || ((a.data ?? "") === (c.data ?? "") && Number(a.numero) > Number(c.numero)), `fora de ordem em ${i}`);
  }
  assert.ok(e.every((x) => x.orgaoGestor === `O${Number(x.numero) % 7}` && x.fonte === `S${Number(x.numero) % 60}` && x.valorEmpenhado === Number(x.numero)));
});

test("tela de empenhos: o ano da URL só vale se existe; senão o mais recente", () => {
  const anos = [
    { ano: 2026, n: 1, soma: 0, removidos: 0, atualizadoEm: null },
    { ano: 2025, n: 1, soma: 0, removidos: 0, atualizadoEm: null },
  ];
  assert.equal(anoEscolhido(anos, "2025"), 2025);
  // Ausente, "todos" ou um ano sem empenhos = TODOS OS ANOS (o padrão).
  assert.equal(anoEscolhido(anos, "2019"), ANO_TODOS);
  assert.equal(anoEscolhido(anos, "x"), ANO_TODOS);
  assert.equal(anoEscolhido(anos, "todos"), ANO_TODOS);
  assert.equal(anoEscolhido(anos, undefined), ANO_TODOS);
  assert.equal(anoEscolhido(anos, "0"), ANO_TODOS);
  assert.equal(anoEscolhido([], "2026"), null);
  // Tupla incompleta não quebra.
  assert.deepEqual(empenhosDoPacote({ n: 1, dic: {}, linhas: [[5, "7"]] })[0].valorPago, 0);
});

test("tela de empenhos: a VERSÃO do ano = a última importação promovida DO CARD + a data dos vínculos dele", async () => {
  const b = banco();
  assert.equal(await consultaVersaoEmpenhos(b.db, 1, 2026), "0:");
  b.raw.exec("INSERT INTO centi_lotes (card_id, ano, estado) VALUES (1, 2026, 'promovido'), (1, 2026, 'parcial'), (1, 2025, 'promovido'), (2, 2026, 'promovido')");
  assert.equal(await consultaVersaoEmpenhos(b.db, 1, 2026), "1:");
  assert.equal(await consultaVersaoEmpenhos(b.db, 1, 2025), "3:");
  assert.equal(await consultaVersaoEmpenhos(b.db, 2, 2026), "4:", "cada card tem a sua versão");
  // Mudar os vínculos do card muda a versão (a tela relê o ano).
  b.raw.exec("UPDATE empenho_cards SET vinculos_em = '2026-10-21T10:00:00.000Z' WHERE id = 1");
  assert.equal(await consultaVersaoEmpenhos(b.db, 1, 2026), "1:2026-10-21T10:00:00.000Z");
  assert.equal(await consultaVersaoEmpenhos(b.db, 2, 2026), "4:");
  b.raw.exec("UPDATE centi_lotes SET concluido_em = '2026-10-20 12:00:00' WHERE id = 1");
  b.ins.run("2026|A|1", 2026, "1", null, "A", null, null, null, null, 1, 0, 0, 0, 1, null, 1, null);
  assert.equal((await consultaAnosEmpenhos(b.db, 1))[0].atualizadoEm, "2026-10-20 12:00:00");
  assert.deepEqual(await consultaAnosEmpenhos(b.db, 2), [], "o outro card não vê os empenhos do card 1");
});

test("escopo: o empenho vinculado à UNIDADE da pessoa ou — vínculo só ao órgão — ao ÓRGÃO de uma unidade dela", () => {
  const esc = { unidades: [10], orgaos: [1] };
  assert.ok(empenhoNoEscopo(null, { orgaoId: null, reparticaoId: null }));
  assert.ok(empenhoNoEscopo(esc, { orgaoId: 1, reparticaoId: 10 }));
  assert.ok(!empenhoNoEscopo(esc, { orgaoId: 1, reparticaoId: 11 }), "outra unidade do mesmo órgão não vê");
  assert.ok(empenhoNoEscopo(esc, { orgaoId: 1, reparticaoId: null }), "o vinculado só ao órgão aparece às unidades dele");
  assert.ok(!empenhoNoEscopo(esc, { orgaoId: 2, reparticaoId: null }));
  assert.ok(!empenhoNoEscopo({ unidades: [], orgaos: [] }, { orgaoId: 1, reparticaoId: 10 }));
  assert.equal(chaveEscopoEmpenhos(null), "*");
  assert.equal(chaveEscopoEmpenhos({ unidades: [3, 1], orgaos: [2] }), "u1,3|o2");
  assert.notEqual(chaveEscopoEmpenhos({ unidades: [], orgaos: [] }), chaveEscopoEmpenhos(null));
});

test("coluna Unidade: a sigla da unidade do cadastro vinculada; vinculado só ao órgão, a sigla do órgão; sem vínculo, vazio", async () => {
  const b = banco();
  b.ins.run("2026|PMRV|1", 2026, "1", "2026-01-02", "PMRV", "A", null, null, null, 1, 0, 0, 0, 1, null, 1, 10);
  b.ins.run("2026|FMS|2", 2026, "2", "2026-01-03", "FMS", "B", null, null, null, 1, 0, 0, 0, 1, null, 2, null);
  b.ins.run("2026|X|3", 2026, "3", "2026-01-04", "X", "C", null, null, null, 1, 0, 0, 0, 1, null, null, null);
  const l = empenhosDoPacote(await pacote(b, 2026));
  assert.deepEqual(
    l.map((e) => [e.numero, e.unidade]),
    [
      ["3", null],
      ["2", "FMS"],
      ["1", "SEMED"],
    ],
  );
});

test("escopo no banco: o pacote e os anos só com os empenhos vinculados às unidades/órgãos da pessoa; nenhum = vazio", async () => {
  const b = banco();
  b.ins.run("2026|PMRV|1", 2026, "1", "2026-01-02", "PMRV", "A", null, "3.3.90.30 - MATERIAL", null, 100, 0, 0, 0, 100, null, 1, 10);
  b.ins.run("2026|FMS|2", 2026, "2", "2026-01-03", "FMS", "B", null, "3.3.90.39 - SERVIÇOS", null, 30, 0, 0, 0, 30, null, 2, null);
  b.ins.run("2026|FMS|3", 2026, "3", "2026-01-04", "FMS", "C", null, null, null, 7, 0, 0, 0, 7, "2026-05-01", 2, null);
  b.ins.run("2025|PMRV|9", 2025, "9", "2025-12-30", "PMRV", "X", null, null, null, 1, 0, 0, 0, 1, null, 1, 10);

  const fms = await textoPacoteEmpenhos(b.db, 1, 2026, false, { unidades: [20], orgaos: [2] });
  assert.ok(fms != null);
  assert.deepEqual(empenhosDoPacote(JSON.parse(fms) as PacoteEmpenhos).map((e) => e.numero), ["2"]);
  // O dicionário também é só do recorte (nada de outro órgão vaza no texto).
  assert.ok(!fms.includes("MATERIAL") && !fms.includes("PMRV"));
  const rem = JSON.parse((await textoPacoteEmpenhos(b.db, 1, 2026, true, { unidades: [], orgaos: [2] })) ?? "") as PacoteEmpenhos;
  assert.deepEqual(empenhosDoPacote(rem).map((e) => e.numero), ["3"]);
  // A unidade 11 do órgão 1 não vê o empenho vinculado à unidade 10.
  assert.equal(empenhosDoPacote(JSON.parse((await textoPacoteEmpenhos(b.db, 1, 2026, false, { unidades: [11], orgaos: [1] })) ?? "")).length, 0);
  assert.deepEqual(JSON.parse((await textoPacoteEmpenhos(b.db, 1, 2026, false, { unidades: [], orgaos: [] })) ?? ""), { n: 0, dic: {}, linhas: [] });
  assert.equal(empenhosDoPacote(JSON.parse((await textoPacoteEmpenhos(b.db, 1, 2026, false, null)) ?? "")).length, 2);

  assert.deepEqual((await consultaAnosEmpenhos(b.db, 1, { unidades: [], orgaos: [2] })).map((a) => [a.ano, a.n, a.removidos]), [[2026, 1, 1]]);
  assert.deepEqual((await consultaAnosEmpenhos(b.db, 1, { unidades: [10], orgaos: [1] })).map((a) => a.ano), [2026, 2025]);
  assert.deepEqual(await consultaAnosEmpenhos(b.db, 1, { unidades: [], orgaos: [] }), []);
  assert.equal((await consultaAnosEmpenhos(b.db, 1, null)).length, 2);
});

test("tabela ÚNICA (todos os cards): o mesmo empenho em dois cards UMA vez (o do card de menor id), anos sem duplicar, card na tupla, escopo", async () => {
  const b = banco();
  const ins2 = b.raw.prepare(
    `INSERT INTO empenhos (card_id, chave, ano, numero, data, orgao_gestor, valor_empenhado, valor_anulado, valor_liquidado, valor_pago, saldo_pagar, removido_em, orgao_id, reparticao_id)
     VALUES (?, ?, ?, ?, ?, 'PMRV', ?, 0, 0, 0, 0, ?, 1, ?)`,
  );
  ins2.run(1, "2026|PMRV|1", 2026, "1", "2026-03-01", 100, null, 10);
  ins2.run(2, "2026|PMRV|1", 2026, "1", "2026-03-01", 100, null, 10); // o mesmo empenho no outro card
  ins2.run(2, "2026|PMRV|2", 2026, "2", "2026-05-01", 50, null, 11);
  ins2.run(2, "2026|PMRV|3", 2026, "3", "2026-04-01", 7, "2026-06-01", 10);
  ins2.run(1, "2025|PMRV|9", 2025, "9", "2025-02-01", 1, null, 10);
  const t = await textoPacoteEmpenhos(b.db, null, 2026, false);
  assert.ok(t != null);
  const e = empenhosDoPacote(JSON.parse(t) as PacoteEmpenhos);
  assert.deepEqual(e.map((x) => [x.numero, x.cardId]), [["2", 2], ["1", 1]], "data decrescente; o repetido só do card 1");
  const rem = empenhosDoPacote(JSON.parse((await textoPacoteEmpenhos(b.db, null, 2026, true)) ?? "") as PacoteEmpenhos);
  assert.deepEqual(rem.map((x) => x.numero), ["3"]);
  const anos = await consultaAnosEmpenhos(b.db, null);
  assert.deepEqual(anos.map((a) => [a.ano, a.n, a.soma, a.removidos]), [[2026, 2, 150, 1], [2025, 1, 1, 0]]);
  // Escopo: só a unidade 10.
  const so10 = empenhosDoPacote(JSON.parse((await textoPacoteEmpenhos(b.db, null, 2026, false, { unidades: [10], orgaos: [1] })) ?? "") as PacoteEmpenhos);
  assert.deepEqual(so10.map((x) => x.numero), ["1"]);
  assert.deepEqual((await consultaAnosEmpenhos(b.db, null, { unidades: [11], orgaos: [1] })).map((a) => [a.ano, a.n]), [[2026, 1]]);
});

test("tabela ÚNICA: a VERSÃO muda com a promoção de QUALQUER card de empenhos, os vínculos e os cards (excluir um card)", async () => {
  const b = banco();
  const v0 = await consultaVersaoEmpenhos(b.db, null, 2026);
  b.raw.exec("INSERT INTO centi_lotes (card_id, ano, estado) VALUES (2, 2026, 'promovido')");
  const v1 = await consultaVersaoEmpenhos(b.db, null, 2026);
  assert.notEqual(v1, v0);
  b.raw.exec("UPDATE empenho_cards SET vinculos_em = '2026-10-26T10:00:00.000Z' WHERE id = 1");
  const v2 = await consultaVersaoEmpenhos(b.db, null, 2026);
  assert.notEqual(v2, v1);
  b.raw.exec("INSERT INTO empenho_cards (id, nome, tipo) VALUES (3, 'Liq', 'liquidacoes'); INSERT INTO centi_lotes (card_id, ano, estado) VALUES (3, 2026, 'promovido')");
  assert.equal(await consultaVersaoEmpenhos(b.db, null, 2026), v2, "card de liquidações não mexe na versão dos empenhos");
  b.raw.exec("DELETE FROM empenho_cards WHERE id = 1");
  assert.notEqual(await consultaVersaoEmpenhos(b.db, null, 2026), v2);
});

test("tela de empenhos: TODOS OS ANOS juntos — cada ano com o seu dicionário, as linhas com o ano, todos os anos nas duas ordens", async () => {
  const b = banco();
  b.raw.exec(`INSERT INTO empenho_cards (id, nome) VALUES (9, 'X')`);
  const ins = b.raw.prepare(
    "INSERT INTO empenhos (card_id, ano, chave, numero, data, orgao_gestor, fornecedor, valor_empenhado) VALUES (9, ?, ?, ?, ?, 'PMRV', ?, ?)",
  );
  ins.run(2025, "2025|PMRV|1", "1", "2025-03-10", "ALFA", 10);
  ins.run(2025, "2025|PMRV|2", "2", "2025-11-02", "BETA", 20);
  ins.run(2026, "2026|PMRV|1", "1", "2026-01-15", "GAMA", 30);
  const pacotes = await Promise.all(
    [2026, 2025].map(async (ano) => ({ ano, pacote: JSON.parse(String(await textoPacoteEmpenhos(b.db, 9, ano, false))) as PacoteEmpenhos })),
  );
  const todas = juntarAnos(pacotes);
  assert.equal(todas.length, 3);
  // O dicionário de cada ano não se mistura com o do outro (o fornecedor certo em cada linha).
  assert.deepEqual(
    todas.map((e) => `${e.ano}:${e.numero}:${e.fornecedor}`).sort(),
    ["2025:1:ALFA", "2025:2:BETA", "2026:1:GAMA"],
  );
  const asc = [...todas].sort((a, c) => String(a.data).localeCompare(String(c.data))).map((e) => e.data);
  assert.deepEqual(asc, ["2025-03-10", "2025-11-02", "2026-01-15"]);
  assert.equal(juntarAnos([]).length, 0);
});

test("tela de empenhos: os ANOS leem a última promoção UMA vez por ano — nunca por empenho (a cota diária de leituras do D1)", async () => {
  const b = banco();
  const lote = b.raw.prepare("INSERT INTO centi_lotes (card_id, ano, estado, concluido_em) VALUES (?, ?, ?, ?)");
  const emp = b.raw.prepare("INSERT INTO empenhos (card_id, chave, ano, numero, data, orgao_gestor, valor_empenhado) VALUES (1, ?, ?, ?, '2025-01-01', 'P', 1)");
  b.raw.exec("BEGIN");
  for (let i = 0; i < 2000; i++) lote.run(1, 2024 + (i % 3), i % 2 ? "promovido" : "erro", `2026-0${1 + (i % 9)}-01`);
  for (const ano of [2024, 2025, 2026]) for (let i = 0; i < 10000; i++) emp.run(`${ano}|P|${i}`, ano, String(i));
  b.raw.exec("COMMIT");
  for (const card of [1, null]) {
    const t = performance.now();
    const anos = await consultaAnosEmpenhos(b.db, card);
    // Por empenho (a v1.237.0) levava segundos e lia dezenas de milhões de linhas; por ano, milissegundos.
    assert.ok(performance.now() - t < 1500, `anos ${card ?? "todos"}: ${Math.round(performance.now() - t)} ms`);
    assert.deepEqual(anos.map((a) => a.ano), [2026, 2025, 2024]);
    assert.equal(anos[0].n, 10000);
    assert.equal(anos[0].atualizadoEm, "2026-09-01");
  }
});
