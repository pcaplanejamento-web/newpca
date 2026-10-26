import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { cardPadrao, cardPorOrgao, lerTipoCard, pendenciasDoCard, previaPedido } from "../src/lib/empenho-cards-core.ts";
import { conferirLote, lacunasDoAno, lotePorMes, lotePorOrgao, pedidosEmCurso, periodosAPedir, proximoPedido } from "../src/lib/empenhos-core.ts";
import { comandoRecontarLote, comandoRegistrarPasso, comandosExcluirLotes, comandosFecharLote, consultaUltimoPasso, jaNoLote } from "../src/lib/empenhos-sql.ts";
import { comandosFechoPeriodoLiquidacoes } from "../src/lib/liquidacoes-sql.ts";
import { corpoPagamentos, lerPaginaPagamentos, linhaPagamento, mesDoPeriodo, periodoDoMes } from "../src/lib/pagamentos-core.ts";
import {
  comandoRealinharPagamentos,
  comandosConferirPagamentos,
  comandosPromoverPagamentos,
  contagemPagamentos,
  pagamentosSuspeitos,
  ultimoPagamentoPromovido,
} from "../src/lib/pagamentos-sql.ts";
import { anosPagamentos, COLUNAS_PAGAMENTO, pagamentoCompleto, textoPagamentos } from "../src/lib/pagamentos-tela.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

/** Um registro como a API `GetOrdempaPamento` devolve (os valores como NÚMEROS). */
const pag = (id: number, empenho: number, extra: Record<string, unknown> = {}) => ({
  $type: "ServerAppWCF.Service.Portal.Controllers.OrdemPagamentoItem, Wcf",
  IdOrdemPagamento: id,
  IdNotaEmpenho: empenho,
  Orgao: "PREFEITURA MUNICIPAL DE RIO VERDE",
  DataOrdemPagamento: "07/03/2025",
  CpfCnpjCredor: "11443012000107",
  NomeCredor: "FORNECEDOR",
  Historico: "LIQUIDAÇÃO NF 308",
  ValorDocumento: 3332.0,
  ValorRetencao: 66.64,
  ValorLiquido: 3265.36,
  PossuiAnulacao: false,
  MotivoAnulacao: "",
  ...extra,
});

test("pagamentos: a linha, a anulação, a recusa e a leitura do mês (sem paginação — o total é o que veio)", () => {
  const l = linhaPagamento(pag(1843386, 259677), 2025);
  assert.ok("linha" in l);
  assert.equal(l.linha.chave, "1843386");
  assert.equal(l.linha.numeroEmpenho, "259677", "o IdNotaEmpenho = o número do empenho");
  assert.equal(l.linha.data, "2025-03-07");
  assert.equal(l.linha.valor, 3332);
  assert.equal(l.linha.valorRetencao, 66.64);
  assert.equal(l.linha.valorLiquido, 3265.36);
  assert.equal(l.linha.anulado, 0);
  assert.equal(l.linha.motivoAnulacao, null, "sem anulação, sem motivo (a Centi manda vazio)");
  const an = linhaPagamento(pag(2, 9, { PossuiAnulacao: true, MotivoAnulacao: "ORDEM EXCLUÍDA\nPARA REGULARIZAÇÃO.\n" }), 2025);
  assert.ok("linha" in an && an.linha.anulado === 1 && an.linha.motivoAnulacao === "ORDEM EXCLUÍDA PARA REGULARIZAÇÃO.");
  assert.deepEqual(linhaPagamento({ ...pag(1, 9), IdOrdemPagamento: null }, 2025), { recusado: "sem Id" });
  // A Centi manda aspas sem escape no histórico: a leitura conserta.
  const texto = `[${JSON.stringify(pag(1, 9))},${JSON.stringify(pag(1, 9))},${JSON.stringify(pag(2, 10, { PossuiAnulacao: true }))},${JSON.stringify({ ...pag(3, 11), IdOrdemPagamento: 0 })}]`;
  const p = lerPaginaPagamentos(texto, 2025);
  assert.equal(p.recebidos, 4);
  assert.equal(p.repetidos, 1);
  assert.equal(p.recusados, 1);
  assert.equal(p.total, 3, "distintos + recusados");
  assert.equal(p.soma, 3265.36, "a soma = o pago líquido das NÃO anuladas");
  assert.equal(lerPaginaPagamentos("[]", 2025).total, 0, "mês sem pagamento = total 0");
  assert.throws(() => lerPaginaPagamentos('{"mensagem":"Campo(s) obrigatório(s) para realizar a consulta. Verifique!","campos":["Ano (int)"]}', 2025), /lista de registros/);
});

test("pagamentos: o corpo leva ANO e MÊS como números e o órgão; só mês inteiro; o card padrão", () => {
  assert.deepEqual(corpoPagamentos('{"ano":"{ano}"}', 2025, periodoDoMes(2025, 3), 2), { ano: 2025, mes: 3, idOrgao: 2 });
  assert.deepEqual(corpoPagamentos("{}", 2025, periodoDoMes(2025, 12), 8), { ano: 2025, mes: 12, idOrgao: 8 }, "mesmo sem os marcadores, o ano e o mês vão (sem o mês, a Centi devolveria o ano inteiro)");
  assert.throws(() => corpoPagamentos("{}", 2025, { inicio: "2025-03-01", fim: "2025-03-07" }, 2), /mês inteiro/);
  assert.equal(mesDoPeriodo(periodoDoMes(2024, 2)), 2);
  assert.deepEqual(periodoDoMes(2024, 2), { inicio: "2024-02-01", fim: "2024-02-29" }, "ano bissexto");
  assert.equal(mesDoPeriodo({ inicio: "2025-02-01", fim: "2025-02-27" }), null);
  assert.equal(mesDoPeriodo({ inicio: "2025-02-02", fim: "2025-02-28" }), null);
  const c = cardPadrao("pagamentos");
  assert.equal(c.endpoint, "GetOrdempaPamento");
  assert.deepEqual(previaPedido({ ...c, nome: "x" }, 2025, undefined, "pagamentos").corpo, { ano: 2025, mes: 1, idOrgao: 0 });
  assert.equal(lerTipoCard("pagamentos"), "pagamentos");
  assert.equal(lerTipoCard("x"), "empenhos");
  assert.ok(cardPorOrgao("pagamentos") && cardPorOrgao("liquidacoes") && !cardPorOrgao("empenhos"));
  assert.match(pendenciasDoCard({ configuradoEm: "x", tipo: "pagamentos" }, 0)[0].texto, /pagamentos de todos os órgãos/);
});

test("pagamentos: o ano lido MÊS A MÊS — a fila, a retomada (os órgãos que faltam) e a conferência de lacunas", () => {
  assert.ok(lotePorMes({ modo: "pagamentos" }) && !lotePorMes({ modo: "liquidacoes" }));
  assert.ok(lotePorOrgao({ modo: "pagamentos" }) && lotePorOrgao({ modo: "liquidacoes" }) && !lotePorOrgao({ modo: "dados" }));
  const meses = periodosAPedir(2025, [], true, undefined, true);
  assert.equal(meses.length, 12);
  assert.deepEqual(meses[1], { inicio: "2025-02-01", fim: "2025-02-28" });
  assert.ok(meses.every((m) => mesDoPeriodo(m) != null), "todos os períodos são meses inteiros");
  // Lidos janeiro (fechado) e março (órgão 1 de 2): falta o órgão 2 de março e os demais meses.
  const passo = (inicio: string, fim: string, pagina: number, fimPeriodo = false) => ({ inicio, fim, pagina, estado: "ok" as const, fimPeriodo });
  const jan = periodoDoMes(2025, 1);
  const mar = periodoDoMes(2025, 3);
  const passos = [passo(jan.inicio, jan.fim, 1), passo(jan.inicio, jan.fim, 2, true), passo(mar.inicio, mar.fim, 1)];
  assert.deepEqual(pedidosEmCurso(passos, 2), [{ periodo: mar, pagina: 2 }]);
  assert.deepEqual(proximoPedido(2025, passos, false, 2, true), { periodo: mar, pagina: 2 }, "a automática termina o mês começado");
  assert.deepEqual(proximoPedido(2025, [passo(jan.inicio, jan.fim, 2, true)], false, 2, true), { periodo: periodoDoMes(2025, 2), pagina: 1 }, "depois, o próximo mês (o parâmetro sem {inicio} não importa)");
  assert.deepEqual(lacunasDoAno(2025, [jan, mar]), [periodoDoMes(2025, 2), { inicio: "2025-04-01", fim: "2025-12-31" }]);
  assert.deepEqual(periodosAPedir(2025, [jan, mar], true, undefined, true).slice(0, 2), [periodoDoMes(2025, 2), periodoDoMes(2025, 4)]);
});

/** O card de pagamentos (4) e o de empenhos (1). No cadastro: PMRV (ID na Centi 2, unidade SEFAZ) e FMS (ID 3, unidade SAUDE). */
const PAG = 4;

function banco() {
  const raw = bancoMigrado();
  raw.exec("INSERT INTO orgaos (id, nome, sigla, entidade_centi) VALUES (1, 'Prefeitura', 'PMRV', '2'), (2, 'Saúde', 'FMS', '3')");
  raw.exec("INSERT INTO reparticoes (id, codigo, nome, orgao_id) VALUES (5, 'SEFAZ', 'Fazenda', 1), (6, 'SAUDE', 'Secretaria de Saúde', 2)");
  raw.exec("INSERT INTO empenho_cards (id, nome) VALUES (1, 'Empenhos')");
  raw.exec("INSERT INTO empenho_cards (id, nome, tipo, endpoint) VALUES (4, 'Pagamentos', 'pagamentos', 'GetOrdempaPamento')");
  const db = drizzle(d1Sobre(raw) as never, { schema });
  const novoLote = (orgaos: number[] = [2, 3], ano = 2025) =>
    Number(raw.prepare("INSERT INTO centi_lotes (card_id, ano, modo, orgaos_centi) VALUES (?, ?, 'pagamentos', ?) RETURNING id").get(PAG, ano, JSON.stringify(orgaos))?.id);
  const empenho = (numero: string, orgao: number, unidade: number | null, ano = 2025) =>
    raw.prepare("INSERT INTO empenhos (card_id, chave, ano, numero, orgao_gestor, orgao_id, reparticao_id) VALUES (1, ?, ?, ?, 'G', ?, ?)").run(`${ano}|G|${numero}`, ano, numero, orgao, unidade);
  return { raw, db, novoLote, empenho };
}

/** Lê UM órgão num mês COMO A ROTA FAZ: o staging + a conferência em tempo real + o fecho do mês; o resultado. */
async function guardar(b: ReturnType<typeof banco>, lote: number, regs: Record<string, unknown>[], pagina = 1, idOrgao = 2, orgaos = 1, periodo = periodoDoMes(2025, 3)) {
  const p = lerPaginaPagamentos(JSON.stringify(regs), 2025);
  const novos = p.linhas.length - (await jaNoLote(b.db, lote, p.linhas.map((l) => l.chave)));
  const passo = { ...periodo, pagina, estado: "ok" as const, fimPeriodo: false, status: 200, bytes: 1, ms: 1, recebidos: p.recebidos, novos, recusados: p.recusados, repetidos: p.repetidos, total: p.total, soma: p.soma, mensagem: null, corpo: "{}" };
  const res = (await b.db.batch([
    comandoRegistrarPasso(b.db, lote, passo),
    ...comandosConferirPagamentos(b.db, lote, PAG, 1, pagina, idOrgao, p.linhas),
    ...comandosFechoPeriodoLiquidacoes(b.db, lote, periodo, orgaos),
    comandoRecontarLote(b.db, lote),
    consultaUltimoPasso(b.db, lote),
  ] as never)) as Record<string, unknown>[][];
  const r = res.at(-1)?.[0] ?? {};
  return { novos: r.resNovos, alterados: r.resAlterados, iguais: r.resIguais, semVinculo: r.resSemVinculo, fim: r.fimPeriodo };
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
  const c = await contagemPagamentos(b.db, id, PAG, 2025, orgaos, 1);
  await b.db.batch(comandosPromoverPagamentos(b.db, id, PAG, 2025, orgaos, 1, regra, c) as never);
  return c;
}

const n = (b: ReturnType<typeof banco>, q: string) => (b.raw.prepare(q).get() as { n: number }).n;
const gravados = (b: ReturnType<typeof banco>) =>
  b.raw.prepare("SELECT chave, numero_empenho AS emp, orgao_id AS org, reparticao_id AS rep, id_orgao_centi AS centi, anulado, removido_em IS NOT NULL AS removido FROM pagamentos ORDER BY CAST(chave AS INTEGER)").all().map((x) => ({ ...x }));

test("pagamentos (D1 real): o NÚMERO DO EMPENHO dá o órgão e a unidade; sem o empenho, o órgão do ID na Centi; sem nada, fora", async () => {
  const b = banco();
  b.empenho("9", 2, 6, 2023);
  const l1 = b.novoLote();
  // Órgão 2 da Centi: o pagamento do empenho 9 (de 2023 — restos a pagar) segue o EMPENHO; o do 10 fica no órgão do ID 2.
  assert.deepEqual(await guardar(b, l1, [pag(1, 9), pag(2, 10, { PossuiAnulacao: true, MotivoAnulacao: "x" }), { ...pag(4, 1), IdOrdemPagamento: null }], 1, 2, 2), {
    novos: 2,
    alterados: 0,
    iguais: 0,
    semVinculo: 0,
    fim: 0,
  });
  // Um órgão da Centi SEM cadastro e sem empenho: não tem destino — fica fora; é o último órgão do mês: fecha.
  assert.deepEqual(await guardar(b, l1, [pag(3, 77)], 2, 99, 2), { novos: 0, alterados: 0, iguais: 0, semVinculo: 1, fim: 1 });
  const s = lote(b, l1);
  assert.equal(s.unicos, 3);
  assert.equal(s.totalInformado, 4, "a soma dos órgãos do mês (3 do 1º + 1 do 2º)");
  assert.deepEqual(conferirLote(s), { completo: true });
  assert.equal(s.soma, 3265.36 * 2, "o pago líquido das não anuladas (1 do 1º órgão + 1 do 2º)");
  assert.equal(await pagamentosSuspeitos(b.db, l1), 0);
  assert.deepEqual(await promover(b, l1, "marcar", [2, 99]), { inseridos: 2, atualizados: 0, removidos: 0, fora: 1 });
  assert.deepEqual(gravados(b), [
    { chave: "1", emp: "9", org: 2, rep: 6, centi: 2, anulado: 0, removido: 0 },
    { chave: "2", emp: "10", org: 1, rep: null, centi: 2, anulado: 1, removido: 0 },
  ]);
  assert.equal(n(b, "SELECT COUNT(*) n FROM pagamentos_staging"), 0, "staging limpo");
  assert.equal(lote(b, l1).estado, "promovido");
  assert.deepEqual(await ultimoPagamentoPromovido(b.db, PAG, 2025, 0), { soma: 3265.36 * 2, unicos: 3 });
  // A tabela da tela: o ano do empenho (de 2023) na última coluna; o sem empenho = null.
  const linhas = JSON.parse(await textoPagamentos(PAG, 2025, false, null, b.db)) as unknown[][];
  const ano = COLUNAS_PAGAMENTO.indexOf("anoEmpenho");
  assert.deepEqual(linhas.map((l) => [l[0] != null, l[ano]]).sort(), [[true, 2023], [true, null]].sort());
  assert.deepEqual((await anosPagamentos(PAG, null, b.db)).map((x) => ({ ...x })), [{ ano: 2025, n: 2 }]);
  // O ESCOPO: a pessoa da unidade SAUDE vê só o pagamento do empenho dela.
  const so = JSON.parse(await textoPagamentos(PAG, 2025, false, { unidades: [6], orgaos: [] }, b.db)) as unknown[][];
  assert.equal(so.length, 1);
  const id1 = Number((b.raw.prepare("SELECT id FROM pagamentos WHERE chave = '1'").get() as { id: number }).id);
  const comp = await pagamentoCompleto(PAG, id1, null, b.db);
  assert.equal(comp?.empenho?.ano, 2023, "o banner traz o empenho ligado, de outro ano");
  assert.equal(comp?.unidade, "SAUDE — Secretaria de Saúde");
  assert.equal(await pagamentoCompleto(PAG, id1, { unidades: [5], orgaos: [] }, b.db), null, "fora do escopo = inexistente");
  assert.equal(await pagamentoCompleto(1, id1, null, b.db), null, "de outro card = inexistente");
});

test("pagamentos (D1 real): REALINHAR — o empenho que chega depois leva o pagamento junto; reimportar fica igual", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await guardar(b, l1, [pag(1, 9), pag(2, 10)]);
  await promover(b, l1);
  assert.deepEqual(gravados(b).map((x) => [x.org, x.rep]), [
    [1, null],
    [1, null],
  ]);
  b.empenho("9", 2, 6);
  await b.db.batch([comandoRealinharPagamentos(b.db)] as never);
  assert.deepEqual(gravados(b).map((x) => [x.chave, x.org, x.rep]), [
    ["1", 2, 6],
    ["2", 1, null],
  ]);
  const l2 = b.novoLote();
  assert.deepEqual(await guardar(b, l2, [pag(1, 9), pag(2, 10)]), { novos: 0, alterados: 0, iguais: 2, semVinculo: 0, fim: 1 });
});

test("pagamentos (D1 real): reimportar atualiza o que mudou (a anulação também), marca o que sumiu; 'apagar' tira de vez", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await guardar(b, l1, [pag(1, 9), pag(2, 10)], 1, 2, 2);
  await guardar(b, l1, [pag(5, 50)], 2, 3, 2);
  await promover(b, l1);
  b.raw.exec("INSERT INTO pagamentos (chave, ano, numero_empenho, id_orgao_centi, orgao_id, card_id) VALUES ('8', 2025, '80', 7, 1, 4)");
  const l2 = b.novoLote();
  await guardar(b, l2, [pag(1, 9, { PossuiAnulacao: true, MotivoAnulacao: "ANULADA" })], 1, 2, 2);
  assert.deepEqual(await guardar(b, l2, [], 2, 3, 2), { novos: 0, alterados: 0, iguais: 0, semVinculo: 0, fim: 1 });
  assert.deepEqual(await promover(b, l2), { inseridos: 0, atualizados: 1, removidos: 2, fora: 0 });
  assert.deepEqual(gravados(b).map((x) => [x.chave, x.anulado, x.removido]), [
    ["1", 1, 0],
    ["2", 0, 1],
    ["5", 0, 1],
    ["8", 0, 0],
  ], "a 1 foi anulada na Centi; a 2 e a 5 sumiram; a 8 é de outro órgão");
  const l3 = b.novoLote();
  await guardar(b, l3, [pag(2, 10)]);
  assert.equal((await promover(b, l3, "apagar")).removidos, 1);
  assert.deepEqual(gravados(b).map((x) => [x.chave, x.removido]), [
    ["2", 0],
    ["5", 1],
    ["8", 0],
  ]);
});

test("pagamentos (D1 real): valor suspeito não promove; fechar e excluir o lote limpam o staging; os gravados ficam sem o lote", async () => {
  const b = banco();
  const l0 = b.novoLote();
  await guardar(b, l0, [pag(1, 9, { ValorLiquido: -5 })]);
  assert.equal(await pagamentosSuspeitos(b.db, l0), 1);
  await b.db.batch(comandosFecharLote(b.db, l0, "parcial", "x") as never);
  assert.equal(n(b, "SELECT COUNT(*) n FROM pagamentos_staging"), 0);
  const l1 = b.novoLote();
  await guardar(b, l1, [pag(1, 9)]);
  await promover(b, l1);
  const l2 = b.novoLote();
  await guardar(b, l2, [pag(7, 9)]);
  await b.db.batch(comandosExcluirLotes(b.db, PAG, [l1, l2]) as never);
  assert.equal(n(b, "SELECT COUNT(*) n FROM pagamentos_staging"), 0);
  assert.equal(n(b, "SELECT COUNT(*) n FROM centi_lotes"), 1, "só a parcial (l0) fica");
  assert.equal(n(b, "SELECT COUNT(*) n FROM pagamentos WHERE lote_id IS NULL"), 1, "o gravado fica, sem o lote");
});

test("pagamentos (D1 real): TABELA ÚNICA — todos os cards, o mesmo pagamento em dois cards UMA vez (o do card de menor id), com o card na tupla", async () => {
  const b = banco();
  b.empenho("9", 2, 6, 2023);
  const l1 = b.novoLote();
  await guardar(b, l1, [pag(1, 9), pag(2, 10, { DataOrdemPagamento: "20/03/2025" })], 1, 2, 1);
  await promover(b, l1, "marcar", [2]);
  const cols = (b.raw.prepare("PRAGMA table_info(pagamentos)").all() as { name: string }[]).map((c) => c.name).filter((c) => c !== "id" && c !== "card_id");
  b.raw.exec(`INSERT INTO empenho_cards (id, nome, tipo) VALUES (99, 'Outro', 'pagamentos')`);
  b.raw.exec(`INSERT INTO pagamentos (card_id, ${cols.join(", ")}) SELECT 99, ${cols.join(", ")} FROM pagamentos WHERE chave = '1' AND card_id = ${PAG}`);
  const col = (c: (typeof COLUNAS_PAGAMENTO)[number]) => COLUNAS_PAGAMENTO.indexOf(c);
  const todos = JSON.parse(await textoPagamentos(null, 2025, false, null, b.db)) as unknown[][];
  assert.deepEqual(
    todos.map((t) => [t[col("data")], t[col("cardId")]]),
    [
      ["2025-03-20", PAG],
      ["2025-03-07", PAG],
    ],
    "da data mais recente à mais antiga; a cópia do card 99 não repete",
  );
  assert.deepEqual((await anosPagamentos(null, null, b.db)).map((x) => ({ ...x })), [{ ano: 2025, n: 2 }]);
  assert.equal((JSON.parse(await textoPagamentos(null, 2025, false, { unidades: [6], orgaos: [] }, b.db)) as unknown[][]).length, 1);
  assert.equal((JSON.parse(await textoPagamentos(99, 2025, false, null, b.db)) as unknown[][]).length, 1);
});
