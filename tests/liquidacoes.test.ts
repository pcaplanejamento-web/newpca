import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { conferirLote, continuarPeriodo, totalDoPeriodo } from "../src/lib/empenhos-core.ts";
import { comandoRecontarLote, comandoRegistrarPasso, comandoSoltarLote, comandosExcluirLotes, comandosFecharLote, consultaUltimoPasso, jaNoLote } from "../src/lib/empenhos-sql.ts";
import { corpoLiquidacoes, idCenti, lerOrgaosCenti, lerPaginaLiquidacoes, linhaLiquidacao, orgaoDaPagina, orgaosDaCenti } from "../src/lib/liquidacoes-core.ts";
import {
  comandoRealinharLiquidacoes,
  comandosConferirLiquidacoes,
  comandosGuardarLiquidacoes,
  comandosPromoverLiquidacoes,
  contagemLiquidacoes,
  liquidacoesSuspeitas,
  totalAntesDaPagina,
  ultimaLiquidacaoPromovida,
} from "../src/lib/liquidacoes-sql.ts";
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
  const semEmpenho = linhaLiquidacao(liq(1, ""), 2025);
  assert.ok("linha" in semEmpenho && semEmpenho.linha.numeroEmpenho === "");
  const p = lerPaginaLiquidacoes(JSON.stringify([liq(1, "9"), liq(1, "9"), liq(2, "10"), { ...liq(3, "11"), Id: 0 }]), 2025);
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

test("liquidações: o pedido leva o órgão da Centi; os órgãos de uma importação = os ID na Centi do cadastro", () => {
  assert.deepEqual(corpoLiquidacoes('{"dataInicio":"{inicio}","dataFim":"{fim}"}', 2025, { inicio: "2025-03-01", fim: "2025-03-07" }, 2), {
    dataInicio: "01/03/2025",
    dataFim: "07/03/2025",
    idOrgao: 2,
  });
  assert.equal(idCenti(" 02 "), 2);
  assert.equal(idCenti("abc"), null);
  assert.equal(idCenti(null), null);
  assert.deepEqual(orgaosDaCenti(["8", null, "02", "8", "x", " 24 "]), [2, 8, 24], "sem repetir, em ordem, sem os inválidos");
  assert.deepEqual(lerOrgaosCenti("[2,8]"), [2, 8]);
  assert.equal(lerOrgaosCenti("[]"), null);
  assert.equal(lerOrgaosCenti("[2,0]"), null);
  assert.equal(lerOrgaosCenti("x"), null);
  assert.equal(orgaoDaPagina([2, 8], 1), 2, "a página N do período é o N-ésimo órgão");
  assert.equal(orgaoDaPagina([2, 8], 2), 8);
  assert.equal(orgaoDaPagina([2, 8], 3), null);
  assert.equal(orgaoDaPagina(null, 1), null);
});

/** O card de liquidações (3) e o de empenhos (1). No cadastro: PMRV (ID na Centi 2, unidade SEFAZ) e FMS (ID 3, unidade SAUDE). */
const LIQ = 3;

function banco() {
  const raw = bancoMigrado();
  raw.exec("INSERT INTO orgaos (id, nome, sigla, entidade_centi) VALUES (1, 'Prefeitura', 'PMRV', '2'), (2, 'Saúde', 'FMS', '3')");
  raw.exec("INSERT INTO reparticoes (id, codigo, nome, orgao_id) VALUES (5, 'SEFAZ', 'Fazenda', 1), (6, 'SAUDE', 'Secretaria de Saúde', 2)");
  raw.exec("INSERT INTO empenho_cards (id, nome) VALUES (1, 'Empenhos')");
  raw.exec("INSERT INTO empenho_cards (id, nome, tipo, endpoint) VALUES (3, 'Liquidações', 'liquidacoes', 'getliquidacoes')");
  const db = drizzle(d1Sobre(raw) as never, { schema });
  const novoLote = (orgaos: number[] = [2, 3], ano = 2025) =>
    Number(raw.prepare("INSERT INTO centi_lotes (card_id, ano, modo, orgaos_centi) VALUES (?, ?, 'liquidacoes', ?) RETURNING id").get(LIQ, ano, JSON.stringify(orgaos))?.id);
  /** Um EMPENHO no sistema (o número liga a liquidação a ele): o vínculo dele dá o órgão e a unidade. */
  const empenho = (numero: string, orgao: number, unidade: number | null) =>
    raw.prepare("INSERT INTO empenhos (card_id, chave, ano, numero, orgao_gestor, orgao_id, reparticao_id) VALUES (1, ?, 2025, ?, 'G', ?, ?)").run(`2025|G|${numero}`, numero, orgao, unidade);
  return { raw, db, novoLote, empenho };
}

/** Lê UM órgão no período COMO A ROTA FAZ (a "página" é o órgão): o staging + a conferência em tempo real; o resultado. */
async function guardar(b: ReturnType<typeof banco>, lote: number, regs: Record<string, unknown>[], pagina = 1, idOrgao = 2, ultima = true) {
  const p = lerPaginaLiquidacoes(JSON.stringify(regs), 2025);
  const novos = p.linhas.length - (await jaNoLote(b.db, lote, p.linhas.map((l) => l.chave)));
  const periodo = { inicio: "2025-01-01", fim: "2025-12-31" };
  const total = (await totalAntesDaPagina(b.db, lote, periodo, pagina)) + (p.total ?? 0);
  const passo = { ...periodo, pagina, estado: "ok" as const, fimPeriodo: ultima, status: 200, bytes: 1, ms: 1, recebidos: p.recebidos, novos, recusados: p.recusados, repetidos: p.repetidos, total, soma: p.soma, mensagem: null, corpo: "{}" };
  const res = (await b.db.batch([
    comandoRegistrarPasso(b.db, lote, passo),
    ...comandosGuardarLiquidacoes(b.db, lote, pagina, idOrgao, p.linhas),
    ...comandosConferirLiquidacoes(b.db, lote, LIQ, 1, p.linhas.map((l) => l.chave)),
    comandoRecontarLote(b.db, lote),
    consultaUltimoPasso(b.db, lote),
  ] as never)) as Record<string, unknown>[][];
  const r = res.at(-1)?.[0] ?? {};
  return { novos: r.resNovos, alterados: r.resAlterados, iguais: r.resIguais, semVinculo: r.resSemVinculo };
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

async function promover(b: ReturnType<typeof banco>, id: number, regra: "marcar" | "apagar" = "marcar", orgaos = [2, 3]) {
  const c = await contagemLiquidacoes(b.db, id, LIQ, 2025, orgaos, 1);
  await b.db.batch(comandosPromoverLiquidacoes(b.db, id, LIQ, 2025, orgaos, 1, regra, c) as never);
  return c;
}

const n = (b: ReturnType<typeof banco>, q: string) => (b.raw.prepare(q).get() as { n: number }).n;
const gravadas = (b: ReturnType<typeof banco>) =>
  b.raw.prepare("SELECT chave, numero_empenho AS emp, orgao_id AS org, reparticao_id AS rep, id_orgao_centi AS centi, removido_em IS NOT NULL AS removida FROM liquidacoes ORDER BY CAST(chave AS INTEGER)").all().map((x) => ({ ...x }));

test("liquidações (D1 real): o NÚMERO DO EMPENHO dá o órgão e a unidade; sem o empenho, o órgão do ID na Centi; sem nada, fora", async () => {
  const b = banco();
  b.empenho("9", 2, 6);
  const l1 = b.novoLote();
  // Órgão 2 da Centi: a liquidação do empenho 9 segue o EMPENHO (FMS/SAUDE), a do 10 (sem empenho) fica no órgão do ID 2.
  assert.deepEqual(await guardar(b, l1, [liq(1, "9"), liq(2, "10"), { ...liq(4, "1"), Id: null }], 1, 2, false), { novos: 2, alterados: 0, iguais: 0, semVinculo: 0 });
  // Um órgão da Centi SEM cadastro e uma liquidação sem empenho: não tem destino — fica fora (conta na conferência).
  assert.deepEqual(await guardar(b, l1, [liq(3, "77")], 2, 99, true), { novos: 0, alterados: 0, iguais: 0, semVinculo: 1 });
  const s = lote(b, l1);
  assert.equal(s.unicos, 3);
  assert.equal(s.totalInformado, 4, "o total ACUMULADO dos órgãos do período (3 do 1º + 1 do 2º)");
  assert.deepEqual(conferirLote(s), { completo: true });
  assert.equal(await liquidacoesSuspeitas(b.db, l1), 0);
  assert.deepEqual(await promover(b, l1, "marcar", [2, 99]), { inseridos: 2, atualizados: 0, removidos: 0, fora: 1 });
  assert.deepEqual(gravadas(b), [
    { chave: "1", emp: "9", org: 2, rep: 6, centi: 2, removida: 0 },
    { chave: "2", emp: "10", org: 1, rep: null, centi: 2, removida: 0 },
  ]);
  assert.equal(n(b, "SELECT COUNT(*) n FROM liquidacoes_staging"), 0, "staging limpo");
  assert.equal(lote(b, l1).estado, "promovido");
  assert.deepEqual(await ultimaLiquidacaoPromovida(b.db, LIQ, 2025, 0), { soma: 4770, unicos: 3 }, "a soma de TODAS as lidas, de todos os órgãos (a mesma régua dos empenhos)");
});

test("liquidações (D1 real): REALINHAR — o empenho que chega depois (ou muda de unidade) leva a liquidação junto", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await guardar(b, l1, [liq(1, "9"), liq(2, "10")]);
  await promover(b, l1);
  assert.deepEqual(gravadas(b).map((x) => [x.org, x.rep]), [
    [1, null],
    [1, null],
  ]);
  b.empenho("9", 2, 6);
  await b.db.batch([comandoRealinharLiquidacoes(b.db)] as never);
  assert.deepEqual(gravadas(b).map((x) => [x.chave, x.org, x.rep]), [
    ["1", 2, 6],
    ["2", 1, null],
  ], "só a do empenho que chegou; a sem empenho fica");
  b.raw.exec("UPDATE empenhos SET reparticao_id = NULL WHERE numero = '9'");
  await b.db.batch([comandoRealinharLiquidacoes(b.db)] as never);
  assert.deepEqual(gravadas(b)[0], { chave: "1", emp: "9", org: 2, rep: null, centi: 2, removida: 0 }, "o empenho vinculado só ao órgão: sem unidade");
  // Reimportar a mesma liquidação depois do realinhamento: igual (o destino é o mesmo do empenho).
  const l2 = b.novoLote();
  assert.deepEqual(await guardar(b, l2, [liq(1, "9"), liq(2, "10")]), { novos: 0, alterados: 0, iguais: 2, semVinculo: 0 });
});

test("liquidações (D1 real): reimportar atualiza o que mudou, marca a que sumiu (só dos órgãos do lote); 'apagar' tira de vez", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await guardar(b, l1, [liq(1, "9"), liq(2, "10")], 1, 2, false);
  await guardar(b, l1, [liq(5, "50")], 2, 3, true);
  await promover(b, l1);
  // A liquidação de um órgão da Centi que não está no lote não é tocada.
  b.raw.exec("INSERT INTO liquidacoes (chave, ano, numero_empenho, id_orgao_centi, orgao_id, card_id) VALUES ('8', 2025, '80', 7, 1, 3)");
  const l2 = b.novoLote();
  await guardar(b, l2, [liq(1, "9", { ValorPago: "1.590,00" })], 1, 2, false);
  assert.deepEqual(await guardar(b, l2, [], 2, 3, true), { novos: 0, alterados: 0, iguais: 0, semVinculo: 0 });
  assert.deepEqual(await promover(b, l2), { inseridos: 0, atualizados: 1, removidos: 2, fora: 0 });
  assert.deepEqual(gravadas(b).map((x) => [x.chave, x.org, x.removida]), [
    ["1", 1, 0],
    ["2", 1, 1],
    ["5", 2, 1],
    ["8", 1, 0],
  ]);
  const l3 = b.novoLote();
  await guardar(b, l3, [liq(2, "10")]);
  assert.equal((await promover(b, l3, "apagar")).removidos, 1);
  assert.deepEqual(gravadas(b).map((x) => [x.chave, x.removida]), [
    ["2", 0],
    ["5", 1],
    ["8", 0],
  ], "a 2 voltou; a 1 sumiu e foi apagada; a 5 já estava removida; a 8 é de outro órgão");
});

test("liquidações (D1 real): CONFERÊNCIA EM TEMPO REAL — a igual à gravada sai do staging e não some na conclusão", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await guardar(b, l1, [liq(1, "9"), liq(2, "10")]);
  await promover(b, l1);
  const l2 = b.novoLote();
  assert.deepEqual(await guardar(b, l2, [liq(1, "9"), liq(2, "10", { ValorPago: "1.590,00" }), liq(3, "11")]), { novos: 1, alterados: 1, iguais: 1, semVinculo: 0 });
  assert.equal(n(b, `SELECT COUNT(*) n FROM liquidacoes_staging WHERE lote_id = ${l2}`), 2, "só a nova e a alterada");
  assert.deepEqual({ ...(b.raw.prepare(`SELECT unicos, fora FROM centi_lotes WHERE id = ${l2}`).get() as object) }, { unicos: 3, fora: 0 });
  assert.deepEqual(await promover(b, l2), { inseridos: 1, atualizados: 1, removidos: 0, fora: 0 });
  assert.equal((b.raw.prepare("SELECT lote_id FROM liquidacoes WHERE chave = '1'").get() as { lote_id: number }).lote_id, l1, "a igual não foi reescrita");
});

test("liquidações (D1 real): fechar e excluir o lote limpam o staging; as gravadas ficam sem o lote; pausar solta a trava", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await guardar(b, l1, [liq(1, "9")]);
  await b.db.batch(comandosFecharLote(b.db, l1, "cancelado", "x") as never);
  assert.equal(n(b, "SELECT COUNT(*) n FROM liquidacoes_staging"), 0);
  const l2 = b.novoLote();
  await guardar(b, l2, [liq(1, "9")]);
  await promover(b, l2);
  const r = (await b.db.batch(comandosExcluirLotes(b.db, LIQ, [l2, 9999]) as never)) as unknown[][];
  assert.equal(r.at(-1)?.length, 1);
  assert.deepEqual(b.raw.prepare("SELECT chave, lote_id FROM liquidacoes").all().map((x) => ({ ...x })), [{ chave: "1", lote_id: null }]);
  // PAUSAR (a leitura parou numa falha): o lote segue lendo, sem dono — qualquer aba continua.
  const l3 = b.novoLote();
  b.raw.exec(`UPDATE centi_lotes SET condutor = 'aba-1', conduzindo_ate = datetime('now', '+120 seconds') WHERE id = ${l3}`);
  await comandoSoltarLote(b.db, l3, "outra-aba");
  assert.equal((b.raw.prepare(`SELECT condutor FROM centi_lotes WHERE id = ${l3}`).get() as { condutor: string | null }).condutor, "aba-1", "só a aba dona solta");
  await comandoSoltarLote(b.db, l3, "aba-1");
  assert.deepEqual({ ...(b.raw.prepare(`SELECT estado, condutor FROM centi_lotes WHERE id = ${l3}`).get() as object) }, { estado: "lendo", condutor: null });
});

test("liquidações (D1 real): a QUEDA só compara com importações de todos os órgãos (as antigas, de um órgão, não servem)", async () => {
  const b = banco();
  b.raw.exec("INSERT INTO centi_lotes (card_id, ano, modo, id_orgao_centi, estado, soma, unicos) VALUES (3, 2025, 'liquidacoes', 2, 'promovido', 999, 9)");
  assert.equal(await ultimaLiquidacaoPromovida(b.db, LIQ, 2025, 0), null);
  const l1 = b.novoLote();
  await guardar(b, l1, [liq(1, "9")]);
  await promover(b, l1);
  assert.deepEqual(await ultimaLiquidacaoPromovida(b.db, LIQ, 2025, 0), { soma: 1590, unicos: 1 });
});

test("liquidações (D1 real): a tela — Órgão e Unidade do CADASTRO (os do empenho) e o órgão da Centi; escopo da própria liquidação", async () => {
  const b = banco();
  b.empenho("9", 1, 5);
  const l1 = b.novoLote();
  await guardar(b, l1, [liq(1, "9"), liq(2, "10")]);
  await promover(b, l1);
  assert.deepEqual((await anosLiquidacoes(LIQ, null, b.db)).map((x) => ({ ...x })), [{ ano: 2025, n: 2 }]);
  const linhas = JSON.parse(await textoLiquidacoes(LIQ, 2025, false, null, b.db)) as unknown[][];
  assert.equal(linhas.length, 2);
  assert.equal(linhas[0].length, COLUNAS_LIQUIDACAO.length);
  const col = (c: (typeof COLUNAS_LIQUIDACAO)[number]) => COLUNAS_LIQUIDACAO.indexOf(c);
  const por = new Map(linhas.map((t) => [t[col("numeroEmpenho")], [t[col("orgao")], t[col("unidade")], t[col("orgaoCenti")]]]));
  assert.deepEqual(por.get("9"), ["PMRV", "SEFAZ", "PREFEITURA"], "a do empenho 9: o órgão e a unidade dele");
  assert.deepEqual(por.get("10"), ["PMRV", null, "PREFEITURA"], "sem empenho: o órgão do ID na Centi, sem unidade");
  const so = JSON.parse(await textoLiquidacoes(LIQ, 2025, false, { unidades: [5], orgaos: [] }, b.db)) as unknown[][];
  assert.equal(so.length, 1);
  assert.equal(so[0][col("numeroEmpenho")], "9");
  assert.equal(JSON.parse(await textoLiquidacoes(LIQ, 2025, true, null, b.db)).length, 0);
});
