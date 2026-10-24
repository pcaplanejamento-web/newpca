import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { comandosCriarCard, comandosGravarOrgaosLiq } from "../src/lib/empenho-cards-sql.ts";
import { conferirLote, continuarPeriodo, totalDoPeriodo } from "../src/lib/empenhos-core.ts";
import { comandoRecontarLote, comandoRegistrarPasso, comandoSoltarLote, comandosExcluirLote, comandosFecharLote, consultaUltimoPasso, jaNoLote } from "../src/lib/empenhos-sql.ts";
import {
  corpoLiquidacoes,
  idCenti,
  lerPaginaLiquidacoes,
  linhaLiquidacao,
  motivoOrgaosInvalidos,
  type OrgaoDoCard,
  pedidosDoCard,
  proximoOrgaoDaRodada,
} from "../src/lib/liquidacoes-core.ts";
import { comandosConferirLiquidacoes, comandosGuardarLiquidacoes, comandosPromoverLiquidacoes, contagemLiquidacoes, liquidacoesSuspeitas, ultimaLiquidacaoPromovida } from "../src/lib/liquidacoes-sql.ts";
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
  assert.ok("linha" in semEmpenho && semEmpenho.linha.numeroEmpenho === "", "independente dos empenhos: o número do empenho é só dado");
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

test("liquidações: o pedido leva o órgão da Centi; os pedidos do card pelo ID na Centi; a regra dos órgãos", () => {
  assert.deepEqual(corpoLiquidacoes('{"dataInicio":"{inicio}","dataFim":"{fim}"}', 2025, { inicio: "2025-03-01", fim: "2025-03-07" }, 2), {
    dataInicio: "01/03/2025",
    dataFim: "07/03/2025",
    idOrgao: 2,
  });
  assert.equal(idCenti(" 02 "), 2);
  assert.equal(idCenti("abc"), null);
  assert.equal(idCenti(null), null);
  const r = pedidosDoCard(
    [
      { orgaoId: 3, reparticaoId: null },
      { orgaoId: 1, reparticaoId: 9 },
      { orgaoId: 2, reparticaoId: null },
    ],
    new Map([
      [1, "02"],
      [2, null],
      [3, "1"],
    ]),
  );
  assert.deepEqual(r, { pedidos: [{ idOrgao: 1, orgaoId: 3, reparticaoId: null }, { idOrgao: 2, orgaoId: 1, reparticaoId: 9 }], semId: [2] }, "na ordem do ID; sem o ID, fora");
  const cadastro = {
    orgaos: new Map([
      [1, { nome: "Prefeitura", centi: "2" }],
      [2, { nome: "Saúde", centi: "3" }],
      [3, { nome: "Sem ID", centi: null }],
      [4, { nome: "Repetido", centi: "3" }],
    ]),
    unidades: new Map<number, number | null>([
      [10, 1],
      [20, 2],
    ]),
  };
  const m = (l: OrgaoDoCard[]) => motivoOrgaosInvalidos(l, cadastro) ?? "";
  assert.equal(motivoOrgaosInvalidos([{ orgaoId: 1, reparticaoId: 10 }, { orgaoId: 2, reparticaoId: null }], cadastro), null);
  assert.match(m([{ orgaoId: 1, reparticaoId: null }, { orgaoId: 1, reparticaoId: null }]), /duas vezes/);
  assert.match(m([{ orgaoId: 3, reparticaoId: null }]), /ID na Centi/);
  assert.match(m([{ orgaoId: 2, reparticaoId: null }, { orgaoId: 4, reparticaoId: null }]), /mesmo ID na Centi \(3\)/);
  assert.match(m([{ orgaoId: 1, reparticaoId: 20 }]), /unidade desse órgão/);
  assert.match(m([{ orgaoId: 99, reparticaoId: null }]), /não existe/);
});

/** O card de liquidações e o destino do órgão 2 da Centi (o órgão 1 do cadastro). */
const LIQ = 3;
const DESTINO: OrgaoDoCard = { orgaoId: 1, reparticaoId: null };

function banco() {
  const raw = bancoMigrado();
  raw.exec("INSERT INTO orgaos (id, nome, sigla, entidade_centi) VALUES (1, 'Prefeitura', 'PMRV', '2'), (2, 'Saúde', 'FMS', '3')");
  raw.exec("INSERT INTO reparticoes (id, codigo, nome, orgao_id) VALUES (5, 'SEFAZ', 'Fazenda', 1)");
  raw.exec("INSERT INTO empenho_cards (id, nome, tipo, endpoint) VALUES (3, 'Liquidações', 'liquidacoes', 'getliquidacoes')");
  raw.exec("INSERT INTO liquidacao_card_orgaos (card_id, orgao_id) VALUES (3, 1)");
  const db = drizzle(d1Sobre(raw) as never, { schema });
  const novoLote = (ano = 2025, card = LIQ, idOrgao = 2) =>
    Number(raw.prepare("INSERT INTO centi_lotes (card_id, ano, modo, id_orgao_centi) VALUES (?, ?, 'liquidacoes', ?) RETURNING id").get(card, ano, idOrgao)?.id);
  return { raw, db, novoLote };
}

/** Lê um período COMO A ROTA FAZ: todas as liquidações do órgão ao staging + a conferência em tempo real; devolve o resultado. */
async function guardar(b: ReturnType<typeof banco>, lote: number, regs: Record<string, unknown>[], destino = DESTINO) {
  const p = lerPaginaLiquidacoes(JSON.stringify(regs), 2025);
  const novos = p.linhas.length - (await jaNoLote(b.db, lote, p.linhas.map((l) => l.chave)));
  const passo = { inicio: "2025-01-01", fim: "2025-12-31", pagina: 1, estado: "ok" as const, fimPeriodo: true, status: 200, bytes: 1, ms: 1, recebidos: p.recebidos, novos, recusados: p.recusados, repetidos: p.repetidos, total: p.total, soma: p.soma, mensagem: null, corpo: "{}" };
  const res = (await b.db.batch([
    comandoRegistrarPasso(b.db, lote, passo),
    ...comandosGuardarLiquidacoes(b.db, lote, 1, p.linhas),
    ...comandosConferirLiquidacoes(b.db, lote, LIQ, destino, 1, p.linhas.map((l) => l.chave)),
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

async function promover(b: ReturnType<typeof banco>, id: number, regra: "marcar" | "apagar" = "marcar", destino = DESTINO) {
  const c = await contagemLiquidacoes(b.db, id, LIQ, destino, 2025, 2, 1);
  await b.db.batch(comandosPromoverLiquidacoes(b.db, id, LIQ, destino, 2025, 2, 1, regra, c) as never);
  return c;
}

const n = (b: ReturnType<typeof banco>, q: string) => (b.raw.prepare(q).get() as { n: number }).n;

test("liquidações (D1 real): INDEPENDENTES — tudo do órgão é gravado com o destino dele, sem empenho nenhum no banco", async () => {
  const b = banco();
  assert.equal(n(b, "SELECT COUNT(*) n FROM empenhos"), 0);
  const l1 = b.novoLote();
  assert.deepEqual(await guardar(b, l1, [liq(1, "9"), liq(2, "10"), liq(3, ""), { ...liq(4, "1"), Id: null }]), { novos: 3, alterados: 0, iguais: 0, semVinculo: 0 });
  const s = lote(b, l1);
  assert.equal(s.unicos, 3);
  assert.equal(s.fora, 0);
  assert.equal(s.totalInformado, 4);
  assert.deepEqual(conferirLote(s), { completo: true }, "distintos + recusados = o total do período");
  assert.equal(await liquidacoesSuspeitas(b.db, l1), 0);
  assert.deepEqual(await promover(b, l1), { inseridos: 3, atualizados: 0, removidos: 0, fora: 0 });
  const gravadas = b.raw.prepare("SELECT chave, numero_empenho AS emp, orgao_id AS org, reparticao_id AS rep, id_orgao_centi AS centi FROM liquidacoes ORDER BY chave").all().map((x) => ({ ...x }));
  assert.deepEqual(gravadas, [
    { chave: "1", emp: "9", org: 1, rep: null, centi: 2 },
    { chave: "2", emp: "10", org: 1, rep: null, centi: 2 },
    { chave: "3", emp: "", org: 1, rep: null, centi: 2 },
  ]);
  assert.equal(n(b, "SELECT COUNT(*) n FROM liquidacoes_staging"), 0, "staging limpo");
  assert.equal(lote(b, l1).estado, "promovido");
  assert.deepEqual(await ultimaLiquidacaoPromovida(b.db, LIQ, 2025, 2, 0), { soma: 4770, unicos: 3 }, "a soma de TODAS as lidas (a mesma régua dos empenhos)");
});

test("liquidações (D1 real): reimportar atualiza o que mudou, marca a que sumiu; a regra 'apagar' tira de vez", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await guardar(b, l1, [liq(1, "9"), liq(2, "10")]);
  await promover(b, l1);
  const l2 = b.novoLote();
  assert.deepEqual(await guardar(b, l2, [liq(1, "9", { ValorPago: "1.590,00" })]), { novos: 0, alterados: 1, iguais: 0, semVinculo: 0 });
  assert.deepEqual(await promover(b, l2), { inseridos: 0, atualizados: 1, removidos: 1, fora: 0 });
  const rows = b.raw.prepare("SELECT chave, valor_pago AS pago, removido_em IS NOT NULL AS removida FROM liquidacoes ORDER BY chave").all().map((x) => ({ ...x }));
  assert.deepEqual(rows, [
    { chave: "1", pago: 1590, removida: 0 },
    { chave: "2", pago: 590, removida: 1 },
  ]);
  const l3 = b.novoLote();
  await guardar(b, l3, [liq(2, "10")]);
  assert.equal((await promover(b, l3, "apagar")).removidos, 1);
  assert.deepEqual(b.raw.prepare("SELECT chave, removido_em IS NOT NULL AS r FROM liquidacoes ORDER BY chave").all().map((x) => ({ ...x })), [{ chave: "2", r: 0 }], "a 2 voltou (reativada); a 1 sumiu e foi apagada");
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

test("liquidações (D1 real): a UNIDADE DE DESTINO muda — a liquidação conta como alterada e a gravação acompanha", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await guardar(b, l1, [liq(1, "9")]);
  await promover(b, l1);
  const comUnidade = { orgaoId: 1, reparticaoId: 5 };
  const l2 = b.novoLote();
  assert.deepEqual(await guardar(b, l2, [liq(1, "9")], comUnidade), { novos: 0, alterados: 1, iguais: 0, semVinculo: 0 }, "o destino entra na comparação");
  await promover(b, l2, "marcar", comUnidade);
  assert.equal((b.raw.prepare("SELECT reparticao_id AS r FROM liquidacoes WHERE chave = '1'").get() as { r: number }).r, 5);
});

test("liquidações (D1 real): os ÓRGÃOS do card — trocar a unidade leva as gravadas; tirar o órgão tira as liquidações dele", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await guardar(b, l1, [liq(1, "9"), liq(2, "10")]);
  await promover(b, l1);
  await b.db.batch(comandosGravarOrgaosLiq(b.db, LIQ, [{ orgaoId: 1, reparticaoId: 5 }, { orgaoId: 2, reparticaoId: null }]) as never);
  assert.deepEqual(
    b.raw.prepare("SELECT orgao_id AS o, reparticao_id AS r FROM liquidacoes ORDER BY chave").all().map((x) => ({ ...x })),
    [
      { o: 1, r: 5 },
      { o: 1, r: 5 },
    ],
  );
  assert.equal(n(b, "SELECT COUNT(*) n FROM liquidacao_card_orgaos WHERE card_id = 3"), 2);
  await b.db.batch(comandosGravarOrgaosLiq(b.db, LIQ, [{ orgaoId: 2, reparticaoId: null }]) as never);
  assert.equal(n(b, "SELECT COUNT(*) n FROM liquidacoes"), 0, "o órgão 1 (ID 2 na Centi) saiu — as liquidações dele também");
  // Criar um card copiando os órgãos de outro card de liquidações.
  const r = (await b.db.batch(comandosCriarCard(b.db, { nome: "Cópia", tipo: "liquidacoes" }, LIQ, "liquidacoes") as never)) as { id: number }[][];
  const novo = Number(r.at(-1)?.[0]?.id);
  assert.deepEqual(b.raw.prepare(`SELECT orgao_id AS o FROM liquidacao_card_orgaos WHERE card_id = ${novo}`).all().map((x) => ({ ...x })), [{ o: 2 }]);
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
  const r = (await b.db.batch(comandosExcluirLote(b.db, l2) as never)) as unknown[][];
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

test("liquidações (D1 real): a tela — os anos e as tuplas montadas pelo banco, no escopo da PRÓPRIA liquidação", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await guardar(b, l1, [liq(1, "9")], { orgaoId: 1, reparticaoId: 5 });
  await promover(b, l1, "marcar", { orgaoId: 1, reparticaoId: 5 });
  const l2 = b.novoLote();
  await guardar(b, l2, [liq(1, "9", {}), liq(2, "10")], { orgaoId: 1, reparticaoId: 5 });
  await promover(b, l2, "marcar", { orgaoId: 1, reparticaoId: 5 });
  b.raw.exec("UPDATE liquidacoes SET reparticao_id = NULL WHERE chave = '2'");
  assert.deepEqual((await anosLiquidacoes(LIQ, null, b.db)).map((x) => ({ ...x })), [{ ano: 2025, n: 2 }]);
  const linhas = JSON.parse(await textoLiquidacoes(LIQ, 2025, false, null, b.db)) as unknown[][];
  assert.equal(linhas.length, 2);
  assert.equal(linhas[0].length, COLUNAS_LIQUIDACAO.length);
  const u = COLUNAS_LIQUIDACAO.indexOf("unidade");
  assert.deepEqual(linhas.map((t) => t[u]).sort(), ["PMRV", "SEFAZ"], "a unidade de destino; só o órgão = a sigla do órgão");
  const so = JSON.parse(await textoLiquidacoes(LIQ, 2025, false, { unidades: [5], orgaos: [] }, b.db)) as unknown[][];
  assert.equal(so.length, 1);
  assert.equal(so[0][COLUNAS_LIQUIDACAO.indexOf("numeroEmpenho")], "9");
  assert.equal(JSON.parse(await textoLiquidacoes(LIQ, 2025, true, null, b.db)).length, 0);
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
  assert.deepEqual(proximoOrgaoDaRodada([{ id: 13, ano: 2024, idOrgaoCenti: 2 }, { id: 12, ano: 2025, idOrgaoCenti: 9 }, ...meio], orgaos), { ano: 2024, idOrgao: 5 });
  assert.equal(proximoOrgaoDaRodada([{ id: 1, ano: 2025, idOrgaoCenti: 2 }], [2]), null, "um órgão só: a rodada é ele");
});
