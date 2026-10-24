import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { conferirLote, continuarPeriodo, totalDoPeriodo } from "../src/lib/empenhos-core.ts";
import { comandoRecontarLote, comandoRegistrarPasso, comandosExcluirLote, comandosFecharLote, comandosGuardarFora, jaNoLote } from "../src/lib/empenhos-sql.ts";
import { chaveEmpenhoDaLiquidacao, corpoLiquidacoes, lerPaginaLiquidacoes, linhaLiquidacao, orgaosCentiDoCard, proximoOrgaoDaRodada } from "../src/lib/liquidacoes-core.ts";
import { comandosGuardarLiquidacoes, comandosPromoverLiquidacoes, contagemLiquidacoes, empenhosNoCard, liquidacoesSuspeitas, ultimaLiquidacaoPromovida } from "../src/lib/liquidacoes-sql.ts";
import { anosLiquidacoes, COLUNAS_LIQUIDACAO, textoLiquidacoes } from "../src/lib/liquidacoes-tela.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

/** Um registro como a API `getliquidacoes` devolve (os valores em pt-BR com 2 casas). */
const liq = (id: number, empenho: string, extra: Record<string, unknown> = {}) => ({
  Id: id,
  NumeroLiquidacao: "6086",
  DataLiquidacao: "07/03/2025",
  NumeroEmpenho: empenho,
  CpfCnpjCredor: "01517794000128",
  Credor: "FORNECEDOR",
  Historico: "LIQUIDAÇÃO DA NF",
  Valor: "1.590,00",
  ValorAnulacao: "0,00",
  ValorLiquido: "1.590,00",
  ValorPago: "590,00",
  Saldo: "1.000,00",
  Orgao: "PREFEITURA",
  docs: [],
  ...extra,
});

test("liquidações: a linha, a recusa e a leitura do período (sem paginação — o total é o que veio)", () => {
  const l = linhaLiquidacao(liq(595421, "292241"), 2025);
  assert.ok("linha" in l);
  assert.equal(l.linha.chave, "595421");
  assert.equal(l.linha.data, "2025-03-07");
  assert.equal(l.linha.valor, 1590);
  assert.equal(l.linha.valorPago, 590);
  assert.equal(l.linha.saldo, 1000);
  assert.deepEqual(linhaLiquidacao({ ...liq(1, "9"), Id: null }, 2025), { recusado: "sem Id" });
  assert.deepEqual(linhaLiquidacao(liq(1, ""), 2025), { recusado: "sem o número do empenho" });
  const p = lerPaginaLiquidacoes(JSON.stringify([liq(1, "9"), liq(1, "9"), liq(2, "10"), liq(3, "")]), 2025);
  assert.equal(p.recebidos, 4);
  assert.equal(p.repetidos, 1);
  assert.equal(p.recusados, 1);
  assert.equal(p.total, 3, "distintos + recusados");
  assert.equal(totalDoPeriodo(p, 1), 3);
  assert.equal(continuarPeriodo({ recebidos: p.recebidos, paginas: 1, total: 3 }, { recebidos: 4, novos: 2 }), false, "uma resposta só por período");
  assert.deepEqual(p.orgaos, ["PREFEITURA"]);
  assert.deepEqual(lerPaginaLiquidacoes("[]", 2025).total, 0, "período sem liquidação = total 0");
  assert.throws(() => lerPaginaLiquidacoes('{"mensagem":"Campo(s) obrigatório(s)"}', 2025), /lista de registros/);
});

test("liquidações: o pedido leva o órgão da Centi e o período; os órgãos do card pelo ID na Centi", () => {
  assert.deepEqual(corpoLiquidacoes('{"dataInicio":"{inicio}","dataFim":"{fim}"}', 2025, { inicio: "2025-03-01", fim: "2025-03-07" }, 2), {
    dataInicio: "01/03/2025",
    dataFim: "07/03/2025",
    idOrgao: 2,
  });
  const r = orgaosCentiDoCard([{ orgaoId: 1 }, { orgaoId: 1 }, { orgaoId: 2 }, { orgaoId: 3 }], new Map([[1, "02"], [2, null], [3, "1"]]));
  assert.deepEqual(r, { ids: [1, 2], semId: [2] });
});

/** O card de liquidações (3) e o de empenhos de origem (1). */
const LIQ = 3;
const ORIGEM = 1;

function banco() {
  const raw = bancoMigrado();
  raw.exec("INSERT INTO orgaos (id, nome, sigla) VALUES (1, 'Prefeitura', 'PMRV'); INSERT INTO empenho_cards (id, nome) VALUES (1, 'Empenhos'), (2, 'Outro'); INSERT INTO empenho_cards (id, nome, tipo, origem_id, endpoint) VALUES (3, 'Liquidações', 'liquidacoes', 1, 'getliquidacoes')");
  raw.exec("INSERT INTO empenho_card_vinculos (card_id, orgao_gestor, orgao_id) VALUES (1, 'PREFEITURA', 1)");
  // O card 3 (LIQUIDAÇÕES) lê os empenhos do card 1 (a ORIGEM). Os empenhos do card 1 (o 9 de 2024 — restos a pagar — e o 10 de 2025); o 11 só no card 2.
  raw.exec(`INSERT INTO empenhos (card_id, chave, ano, numero, orgao_gestor, orgao_id) VALUES
    (1, '2024|PREFEITURA|9', 2024, '9', 'PREFEITURA', 1), (1, '2025|PREFEITURA|10', 2025, '10', 'PREFEITURA', 1), (2, '2025|PREFEITURA|11', 2025, '11', 'PREFEITURA', 1)`);
  const db = drizzle(d1Sobre(raw) as never, { schema });
  const novoLote = (ano = 2025, card = LIQ) => Number(raw.prepare("INSERT INTO centi_lotes (card_id, ano, modo, id_orgao_centi) VALUES (?, ?, 'liquidacoes', 2) RETURNING id").get(card, ano)?.id);
  return { raw, db, novoLote };
}

/** Lê um período como a rota faz: só a de empenho do card vai ao staging; das outras, a chave. */
async function guardar(b: ReturnType<typeof banco>, lote: number, regs: Record<string, unknown>[], origem = ORIGEM) {
  const p = lerPaginaLiquidacoes(JSON.stringify(regs), 2025);
  const doCard = await empenhosNoCard(b.db, origem, p.linhas);
  const tem = (l: (typeof p.linhas)[number]) => doCard.has(chaveEmpenhoDaLiquidacao(l.orgao, l.numeroEmpenho));
  const novos = p.linhas.length - (await jaNoLote(b.db, lote, p.linhas.map((l) => l.chave)));
  const passo = { inicio: "2025-01-01", fim: "2025-12-31", pagina: 1, estado: "ok" as const, fimPeriodo: true, status: 200, bytes: 1, ms: 1, recebidos: p.recebidos, novos, recusados: p.recusados, repetidos: p.repetidos, total: p.total, soma: p.soma, mensagem: null, corpo: "{}" };
  await b.db.batch([
    comandoRegistrarPasso(b.db, lote, passo),
    ...comandosGuardarLiquidacoes(b.db, lote, 1, p.linhas.filter(tem)),
    ...comandosGuardarFora(b.db, lote, p.linhas.filter((l) => !tem(l)).map((l) => l.chave)),
    comandoRecontarLote(b.db, lote),
  ] as never);
}

const lote = (b: ReturnType<typeof banco>, id: number) =>
  b.raw.prepare("SELECT estado, unicos, recusados, recebidos, total_informado AS totalInformado, paginas, fora, soma FROM centi_lotes WHERE id = ?").get(id) as {
    estado: string;
    unicos: number;
    recusados: number;
    recebidos: number;
    totalInformado: number | null;
    paginas: number;
    fora: number;
    soma: number;
  };

async function promover(b: ReturnType<typeof banco>, id: number, regra: "marcar" | "apagar" = "marcar") {
  const c = await contagemLiquidacoes(b.db, id, LIQ, ORIGEM, 2025, 2, 1);
  await b.db.batch(comandosPromoverLiquidacoes(b.db, id, LIQ, ORIGEM, 2025, 2, 1, regra, c) as never);
  return c;
}

test("liquidações (D1 real): só a de EMPENHO do card é guardada; a conferência fecha e a promoção liga ao empenho", async () => {
  const b = banco();
  assert.deepEqual([...(await empenhosNoCard(b.db, 1, [{ orgao: "PREFEITURA", numeroEmpenho: "9" }, { orgao: "PREFEITURA", numeroEmpenho: "11" }]))], [chaveEmpenhoDaLiquidacao("PREFEITURA", "9")]);
  const l1 = b.novoLote();
  await guardar(b, l1, [liq(1, "9"), liq(2, "10"), liq(3, "11"), liq(4, "")]);
  const s = lote(b, l1);
  assert.equal(s.unicos, 3, "2 guardadas + 1 só contada");
  assert.equal(s.fora, 1);
  assert.equal(s.totalInformado, 4);
  assert.deepEqual(conferirLote(s), { completo: true }, "distintos + recusados = o total do período");
  assert.equal(await liquidacoesSuspeitas(b.db, l1), 0);
  const c = await promover(b, l1);
  assert.deepEqual(c, { inseridos: 2, atualizados: 0, removidos: 0, fora: 1 });
  const gravadas = b.raw.prepare("SELECT l.chave, e.numero, l.id_orgao_centi AS org FROM liquidacoes l JOIN empenhos e ON e.id = l.empenho_id ORDER BY l.chave").all().map((x) => ({ ...x }));
  assert.deepEqual(gravadas, [
    { chave: "1", numero: "9", org: 2 },
    { chave: "2", numero: "10", org: 2 },
  ]);
  assert.equal((b.raw.prepare("SELECT COUNT(*) n FROM liquidacoes_staging").get() as { n: number }).n, 0, "staging limpo");
  assert.equal(lote(b, l1).estado, "promovido");
  assert.deepEqual(await ultimaLiquidacaoPromovida(b.db, LIQ, 2025, 2, 0), { soma: 4770, unicos: 3 }, "a soma de TODAS as lidas (a mesma régua dos empenhos)");
});

test("liquidações (D1 real): reimportar atualiza o que mudou, marca a que sumiu; o empenho que sai leva a liquidação", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await guardar(b, l1, [liq(1, "9"), liq(2, "10")]);
  await promover(b, l1);
  const l2 = b.novoLote();
  await guardar(b, l2, [liq(1, "9", { ValorPago: "1.590,00" })]);
  assert.deepEqual(await promover(b, l2), { inseridos: 0, atualizados: 1, removidos: 1, fora: 0 });
  const rows = b.raw.prepare("SELECT chave, valor_pago AS pago, removido_em IS NOT NULL AS removida FROM liquidacoes ORDER BY chave").all().map((x) => ({ ...x }));
  assert.deepEqual(rows, [
    { chave: "1", pago: 1590, removida: 0 },
    { chave: "2", pago: 590, removida: 1 },
  ]);
  // A regra "apagar" tira de vez o que sumiu agora (a já marcada fica como estava — a mesma régua dos empenhos).
  const l3 = b.novoLote();
  await guardar(b, l3, [liq(2, "10")]);
  assert.equal((await promover(b, l3, "apagar")).removidos, 1);
  assert.deepEqual(b.raw.prepare("SELECT chave, removido_em IS NOT NULL AS r FROM liquidacoes ORDER BY chave").all().map((x) => ({ ...x })), [{ chave: "2", r: 0 }], "a 2 voltou (reativada); a 1 sumiu e foi apagada");
  // O empenho que sai do card leva as liquidações dele (cascade).
  b.raw.exec("PRAGMA foreign_keys = ON; DELETE FROM empenhos WHERE numero = '10' AND card_id = 1");
  assert.equal((b.raw.prepare("SELECT COUNT(*) n FROM liquidacoes").get() as { n: number }).n, 0);
});

test("liquidações (D1 real): fechar e excluir o lote limpam o staging; as gravadas ficam sem o lote", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await guardar(b, l1, [liq(1, "9")]);
  await b.db.batch(comandosFecharLote(b.db, l1, "cancelado", "x") as never);
  assert.equal((b.raw.prepare("SELECT COUNT(*) n FROM liquidacoes_staging").get() as { n: number }).n, 0);
  const l2 = b.novoLote();
  await guardar(b, l2, [liq(1, "9")]);
  await promover(b, l2);
  const r = (await b.db.batch(comandosExcluirLote(b.db, l2) as never)) as unknown[][];
  assert.equal(r.at(-1)?.length, 1);
  assert.deepEqual(b.raw.prepare("SELECT chave, lote_id FROM liquidacoes").all().map((x) => ({ ...x })), [{ chave: "1", lote_id: null }]);
});

test("liquidações (D1 real): a tela — os anos e as tuplas montadas pelo banco, no escopo do EMPENHO", async () => {
  const b = banco();
  b.raw.exec("INSERT INTO reparticoes (id, codigo, nome, orgao_id) VALUES (5, 'SEFAZ', 'Fazenda', 1); UPDATE empenhos SET reparticao_id = 5 WHERE numero = '9'");
  const l1 = b.novoLote();
  await guardar(b, l1, [liq(1, "9"), liq(2, "10")]);
  await promover(b, l1);
  assert.deepEqual((await anosLiquidacoes(LIQ, null, b.db)).map((x) => ({ ...x })), [{ ano: 2025, n: 2 }]);
  const linhas = JSON.parse(await textoLiquidacoes(LIQ, 2025, false, null, b.db)) as unknown[][];
  assert.equal(linhas.length, 2);
  assert.equal(linhas[0].length, COLUNAS_LIQUIDACAO.length);
  const porId = new Map(linhas.map((t) => [t[0], t]));
  const u = COLUNAS_LIQUIDACAO.indexOf("unidade");
  assert.deepEqual([...porId.values()].map((t) => t[u]).sort(), ["PMRV", "SEFAZ"], "a unidade do empenho; só o órgão = a sigla do órgão");
  // O escopo é o do empenho: só a SEFAZ vê a liquidação do empenho 9.
  const so = JSON.parse(await textoLiquidacoes(LIQ, 2025, false, { unidades: [5], orgaos: [] }, b.db)) as unknown[][];
  assert.equal(so.length, 1);
  assert.equal(so[0][COLUNAS_LIQUIDACAO.indexOf("numeroEmpenho")], "9");
  assert.equal(JSON.parse(await textoLiquidacoes(LIQ, 2025, true, null, b.db)).length, 0);
});

test("liquidações (D1 real): o card de liquidações grava no PRÓPRIO card, com o empenho do card de ORIGEM", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await guardar(b, l1, [liq(1, "9"), liq(3, "11")]);
  assert.deepEqual(await promover(b, l1), { inseridos: 1, atualizados: 0, removidos: 0, fora: 1 }, "o empenho 11 é do card 2, não da origem");
  assert.deepEqual(b.raw.prepare("SELECT l.card_id AS card, e.card_id AS origem FROM liquidacoes l JOIN empenhos e ON e.id = l.empenho_id").all().map((x) => ({ ...x })), [{ card: LIQ, origem: ORIGEM }]);
  // Excluir o card de ORIGEM: os empenhos saem e levam as liquidações; o card de liquidações fica sem origem.
  b.raw.exec("PRAGMA foreign_keys = ON; DELETE FROM empenho_cards WHERE id = 1");
  assert.equal((b.raw.prepare("SELECT COUNT(*) n FROM liquidacoes").get() as { n: number }).n, 0);
  assert.equal((b.raw.prepare("SELECT origem_id FROM empenho_cards WHERE id = ?").get(LIQ) as { origem_id: number | null }).origem_id, null);
});

test("liquidações: a RODADA da atualização automática — um órgão da Centi após o outro, no mesmo ano", () => {
  const orgaos = [2, 5, 9];
  assert.equal(proximoOrgaoDaRodada([], orgaos), null, "sem lote: a rodada começa na hora do card");
  assert.deepEqual(proximoOrgaoDaRodada([{ id: 10, ano: 2025, idOrgaoCenti: 2 }], orgaos), { ano: 2025, idOrgao: 5 });
  const meio = [
    { id: 11, ano: 2025, idOrgaoCenti: 5 },
    { id: 10, ano: 2025, idOrgaoCenti: 2 },
  ];
  assert.deepEqual(proximoOrgaoDaRodada(meio, orgaos), { ano: 2025, idOrgao: 9 });
  assert.equal(proximoOrgaoDaRodada([{ id: 12, ano: 2025, idOrgaoCenti: 9 }, ...meio], orgaos), null, "rodada completa: espera a próxima hora");
  // Uma rodada NOVA do 1º órgão (outro ano): os lotes antigos dos demais não contam.
  assert.deepEqual(proximoOrgaoDaRodada([{ id: 13, ano: 2024, idOrgaoCenti: 2 }, { id: 12, ano: 2025, idOrgaoCenti: 9 }, ...meio], orgaos), { ano: 2024, idOrgao: 5 });
  assert.equal(proximoOrgaoDaRodada([{ id: 1, ano: 2025, idOrgaoCenti: 2 }], [2]), null, "um órgão só: a rodada é ele");
});
