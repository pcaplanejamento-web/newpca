import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import {
  chaveEmpenho,
  anoInteiro,
  conferirLote,
  continuarPeriodo,
  corpoDaPagina,
  dataIso,
  LEITOR_EMPENHOS,
  lerPaginaEmpenhos,
  linhaEmpenho,
  motivoValoresSuspeitos,
  quedaSuspeita,
  dividirPeriodo,
  lacunasDoAno,
  periodoDoAno,
  MAX_PAGINAS,
  type Periodo,
  periodoEmCurso,
  periodosAPedir,
  periodosLidos,
  rotuloPeriodo,
  tipoDoErro,
  totalDoPeriodo,
  usaPeriodo,
  valor,
} from "../src/lib/empenhos-core.ts";
import {
  comandoConduzir,
  comandoDividirPeriodo,
  comandoExcluirPassos,
  comandosExcluirLote,
  comandosGuardarPagina,
  MAX_JSON_GUARDA,
  comandoRecontarLote,
  comandoRegistrarPasso,
  comandosFecharLote,
  comandosPromover,
  contagemDaPromocao,
  jaNoLote,
  lidoNoPeriodo,
  ultimoPromovido,
  valoresSuspeitos,
} from "../src/lib/empenhos-sql.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

const reg = (numero: string, extra: Record<string, unknown> = {}) => ({ Numero: numero, OrgaoGestor: "PREFEITURA", ValorEmpenhado: 100, ...extra });

function banco() {
  const raw = bancoMigrado();
  // O cadastro mínimo + o card 1 com o órgão gestor dos registros de teste ("PREFEITURA") VINCULADO ao órgão 1.
  raw.exec("INSERT INTO orgaos (id, nome, sigla) VALUES (1, 'Prefeitura', 'PMRV'); INSERT INTO empenho_cards (id, nome) VALUES (1, 'Empenhos'), (2, 'Outro')");
  raw.exec("INSERT INTO empenho_card_vinculos (card_id, orgao_gestor, orgao_id) VALUES (1, 'PREFEITURA', 1)");
  const db = drizzle(d1Sobre(raw) as never, { schema });
  const novoLote = (ano = 2026, card = 1) => Number(raw.prepare("INSERT INTO centi_lotes (card_id, ano) VALUES (?, ?) RETURNING id").get(card, ano)?.id);
  return { raw, db, novoLote };
}

/** Uma página lida como a rota faz: o passo + o staging + a recontagem, num lote. */
async function guardar(b: ReturnType<typeof banco>, lote: number, pagina: number, regs: Record<string, unknown>[], total: number | null = null, periodo: Periodo = anoInteiro(2026), fimPeriodo = true) {
  const p = lerPaginaEmpenhos(JSON.stringify(regs.map((r, i) => (i === 0 && total != null ? { ...r, TotalRegistros: total } : r))), 2026);
  const novos = p.linhas.length - (await jaNoLote(b.db, lote, p.linhas.map((l) => l.chave)));
  const passo = {
    ...periodo,
    pagina,
    estado: "ok" as const,
    fimPeriodo,
    status: 200,
    bytes: 10,
    ms: 5,
    recebidos: p.recebidos,
    novos,
    recusados: p.recusados,
    repetidos: p.repetidos,
    total: totalDoPeriodo(p, pagina),
    soma: p.soma,
    mensagem: null,
    corpo: "{}",
  };
  await b.db.batch([comandoRegistrarPasso(b.db, lote, passo), ...comandosGuardarPagina(b.db, lote, pagina, p.linhas), comandoRecontarLote(b.db, lote)]);
  return { ...p, novos };
}

test("periodoDoAno: sempre o ano inteiro, também o atual", () => {
  assert.deepEqual(periodoDoAno(2025, "2026-10-24"), { inicio: "2025-01-01", fim: "2025-12-31" });
  assert.deepEqual(periodoDoAno(2026, "2026-10-24"), { inicio: "2026-01-01", fim: "2026-12-31" });
  assert.deepEqual(lacunasDoAno(2026, [], "2026-10-24"), [{ inicio: "2026-01-01", fim: "2026-12-31" }]);
  assert.equal(periodosAPedir(2026, [], true, "2026-10-24").at(-1)?.fim, "2026-12-31");
});

test("empenhos: valores, datas e a chave (a MESMA da tabela)", () => {
  assert.equal(valor(1234.5), 1234.5);
  assert.equal(valor("1.234,56"), 1234.56);
  assert.equal(valor("1,234.56"), 1234.56);
  // A Centi manda SEMPRE três casas com a vírgula decimal: "100,000" é R$ 100 (nunca cem mil).
  assert.equal(valor("100,000"), 100);
  assert.equal(valor("0,500"), 0.5);
  assert.equal(valor("12,345"), 12.345);
  assert.equal(valor("3.042,000"), 3042);
  assert.equal(valor("1.234.567,890"), 1234567.89);
  assert.equal(valor("-50,000"), -50);
  assert.equal(valor(""), 0);
  assert.equal(valor(null), 0);
  assert.equal(valor(Number.NaN), 0);
  assert.equal(dataIso("02/01/2026"), "2026-01-02");
  assert.equal(dataIso("2/1/2026 10:30:00"), "2026-01-02");
  assert.equal(dataIso("2026-03-31T00:00:00"), "2026-03-31");
  assert.equal(dataIso("31/02/2026"), null);
  assert.equal(dataIso("x"), null);
  assert.equal(chaveEmpenho(2026, "FMS", "12/2026"), "2026|FMS|12/2026");
});

test("empenhos: registro sem número é RECUSADO (nunca vira 0) e o espaço extra some", () => {
  assert.deepEqual(linhaEmpenho({ Numero: "  ", OrgaoGestor: "X" }, 2026), { recusado: "sem número" });
  const l = linhaEmpenho({ Numero: " 15 ", OrgaoGestor: " FUNDO  DE SAÚDE ", Id: "77", Historico: "a\n b" }, 2026);
  assert.ok("linha" in l);
  assert.equal(l.linha.chave, "2026|FUNDO DE SAÚDE|15");
  assert.equal(l.linha.srcId, 77);
  assert.equal(l.linha.historico, "a b");
  const semId = linhaEmpenho({ Numero: "1", Id: "abc" }, 2026);
  assert.ok("linha" in semId && semId.linha.srcId === null && semId.linha.orgaoGestor === "");
});

test("empenhos: leitura da página — total, recusados e repetidos contados; resposta inválida para", () => {
  const p = lerPaginaEmpenhos(JSON.stringify([reg("1", { TotalRegistros: "1530" }), reg("1"), reg(""), reg("2")]), 2026);
  assert.equal(p.recebidos, 4);
  assert.equal(p.linhas.length, 2);
  assert.equal(p.recusados, 1);
  assert.equal(p.repetidos, 1);
  assert.equal(p.total, 1530);
  assert.equal(lerPaginaEmpenhos(JSON.stringify({ data: [reg("9")] }), 2026).linhas.length, 1);
  assert.throws(() => lerPaginaEmpenhos("<html>", 2026), /não é JSON/);
  assert.throws(() => lerPaginaEmpenhos('{"x":1}', 2026), /lista de registros — veio um objeto com x \(number\)/);
});

test("empenhos: a resposta REAL da Centi — o JSON dentro de um texto e aspas sem escape no histórico", () => {
  // Como a Centi devolveu janeiro de 2026: uma string JSON com o array dentro, quebras \r\n e, no histórico, aspas cruas.
  const interno =
    '[\r\n  {\r\n    "$type": "X.EmpenhoItem, Wcf",\r\n    "Id": 325241,\r\n    "Numero": "325241",\r\n    "OrgaoGestor": "FMC",\r\n' +
    '    "ValorEmpenhado": "1.021,070",\r\n    "Historico": "CONDUZIR ATLETAS PARA O "BRASIL CUP CAPOEIRA" QUE SERÁ, EM "JATAÍ", NO GINÁSIO",\r\n' +
    '    "Elemento": "3.3.90.36.00 - OUTROS",\r\n    "TotalRegistros": 2\r\n  },\r\n  {"Numero": "2", "OrgaoGestor": "FMC", "Historico": "TERMINA COM "ASPAS"", "TotalRegistros": 2}\r\n]';
  const texto = JSON.stringify(interno);
  const p = lerPaginaEmpenhos(texto, 2026);
  assert.equal(p.recebidos, 2);
  assert.equal(p.total, 2);
  assert.equal(p.reparado, true);
  assert.equal(p.linhas[0].historico, 'CONDUZIR ATLETAS PARA O "BRASIL CUP CAPOEIRA" QUE SERÁ, EM "JATAÍ", NO GINÁSIO');
  assert.equal(p.linhas[0].valorEmpenhado, 1021.07);
  assert.equal(p.linhas[0].elemento, "3.3.90.36.00 - OUTROS");
  assert.equal(p.linhas[1].historico, 'TERMINA COM "ASPAS"');
  // JSON bom não é "consertado"; o texto com JSON dentro também é lido; lista em qualquer nível; lista vazia vale.
  assert.equal(lerPaginaEmpenhos(JSON.stringify([reg("1")]), 2026).reparado, false);
  assert.equal(lerPaginaEmpenhos(JSON.stringify(JSON.stringify([reg("1")])), 2026).linhas.length, 1);
  assert.equal(lerPaginaEmpenhos(`\ufeff${JSON.stringify({ d: { Result: { $values: [reg("1"), reg("2")] } } })}`, 2026).linhas.length, 2);
  assert.equal(lerPaginaEmpenhos(JSON.stringify({ data: [] }), 2026).recebidos, 0);
  assert.equal(lerPaginaEmpenhos("[]", 2026).recebidos, 0);
});

test("empenhos: o corpo de cada página (a 1ª sem `pagina`) e o PERÍODO nos marcadores", () => {
  const params = '{"dataInicio":"{inicio}","dataFim":"{fim}"}';
  assert.deepEqual(corpoDaPagina(params, 2026, 1), { dataInicio: "01/01/2026", dataFim: "31/12/2026" });
  assert.deepEqual(corpoDaPagina(params, 2026, 3, { inicio: "2026-05-01", fim: "2026-05-31" }), { dataInicio: "01/05/2026", dataFim: "31/05/2026", pagina: 3 });
  assert.deepEqual(corpoDaPagina('{"dataInicio":"01/01/{ano}","dataFim":"31/12/{ano}"}', 2026, 1), { dataInicio: "01/01/2026", dataFim: "31/12/2026" }, "o formato antigo continua valendo");
  assert.deepEqual(corpoDaPagina('{"p":"{pagina}","a":"{ano}"}', 2025, 1), { p: 1, a: 2025 });
  assert.throws(() => corpoDaPagina("{", 2026, 1), /JSON/);
  assert.equal(usaPeriodo(params), true);
  assert.equal(usaPeriodo('{"ano":"{ano}"}'), false);
});

test("empenhos: o ano SEMANA A SEMANA, o período grande dividido ao meio até um dia, e o que falta ler", () => {
  const meses = periodosAPedir(2026, [], true, "2026-12-31");
  assert.equal(meses.length, 48);
  assert.deepEqual(meses.slice(0, 5), [
    { inicio: "2026-01-01", fim: "2026-01-07" },
    { inicio: "2026-01-08", fim: "2026-01-14" },
    { inicio: "2026-01-15", fim: "2026-01-21" },
    { inicio: "2026-01-22", fim: "2026-01-31" },
    { inicio: "2026-02-01", fim: "2026-02-07" },
  ]);
  assert.deepEqual(periodosAPedir(2026, [], true, "2026-12-31")[7], { inicio: "2026-02-22", fim: "2026-02-28" });
  assert.deepEqual(periodosAPedir(2028, [], true, "2028-12-31")[7], { inicio: "2028-02-22", fim: "2028-02-29" }, "bissexto");
  assert.deepEqual(periodosAPedir(2026, [], false, "2026-12-31"), [anoInteiro(2026)]);
  assert.deepEqual(periodosAPedir(2026, [anoInteiro(2026)], false, "2026-12-31"), []);
  assert.deepEqual(dividirPeriodo({ inicio: "2026-05-01", fim: "2026-05-31" }), [
    { inicio: "2026-05-01", fim: "2026-05-16" },
    { inicio: "2026-05-17", fim: "2026-05-31" },
  ]);
  assert.deepEqual(dividirPeriodo({ inicio: "2026-05-30", fim: "2026-05-31" }), [
    { inicio: "2026-05-30", fim: "2026-05-30" },
    { inicio: "2026-05-31", fim: "2026-05-31" },
  ]);
  assert.equal(dividirPeriodo({ inicio: "2026-05-31", fim: "2026-05-31" }), null);
  // Lidos: jan inteiro, a 1ª metade de maio → faltam fev–abr, 17–31/05 e jun–dez (cortados nos meses).
  const lidos = [
    { inicio: "2026-01-01", fim: "2026-01-31" },
    { inicio: "2026-05-01", fim: "2026-05-16" },
  ];
  assert.deepEqual(lacunasDoAno(2026, lidos, "2026-12-31"), [
    { inicio: "2026-02-01", fim: "2026-04-30" },
    { inicio: "2026-05-17", fim: "2026-12-31" },
  ]);
  const falta = periodosAPedir(2026, lidos, true, "2026-12-31");
  assert.equal(falta.length, 12 + 2 + 28);
  assert.deepEqual(falta.slice(12, 14), [
    { inicio: "2026-05-17", fim: "2026-05-21" },
    { inicio: "2026-05-22", fim: "2026-05-31" },
  ]);
  assert.deepEqual(lacunasDoAno(2026, meses, "2026-12-31"), []);
  assert.equal(rotuloPeriodo({ inicio: "2026-05-01", fim: "2026-05-31" }), "Mai/2026");
  assert.equal(rotuloPeriodo({ inicio: "2026-05-17", fim: "2026-05-31" }), "17/05 a 31/05/2026");
  assert.equal(rotuloPeriodo({ inicio: "2026-05-17", fim: "2026-05-17" }), "17/05/2026");
  assert.equal(rotuloPeriodo(anoInteiro(2026)), "2026 inteiro");
  assert.equal(tipoDoErro("A API da Centi é grande demais (máx. 12 MB)."), "grande");
  assert.equal(tipoDoErro("A resposta da Centi não é JSON."), "resposta");
  assert.equal(tipoDoErro("A API da Centi respondeu 400."), "resposta");
  assert.equal(tipoDoErro("A API da Centi respondeu 503."), "rede");
  assert.equal(tipoDoErro("The operation was aborted due to timeout"), "rede");
});

test("empenhos: a retomada — períodos concluídos, o em curso na próxima página, os divididos não contam", () => {
  const passo = (inicio: string, fim: string, pagina: number, estado: "ok" | "erro" | "dividido", fimPeriodo = false) => ({ inicio, fim, pagina, estado, fimPeriodo });
  const passos = [
    passo("2026-01-01", "2026-01-31", 1, "ok", true),
    passo("2026-02-01", "2026-02-28", 1, "dividido"),
    passo("2026-02-01", "2026-02-14", 1, "ok"),
    passo("2026-02-01", "2026-02-14", 2, "erro"),
    passo("2026-02-01", "2026-02-14", 2, "ok"),
  ];
  assert.deepEqual(periodosLidos(passos), [{ inicio: "2026-01-01", fim: "2026-01-31" }]);
  assert.deepEqual(periodoEmCurso(passos), { periodo: { inicio: "2026-02-01", fim: "2026-02-14" }, pagina: 3 });
  assert.equal(periodoEmCurso(passos.slice(0, 1)), null);
});

test("empenhos: quando continuar no período e a CONFERÊNCIA (falha no meio ou página repetida nunca é 'completo')", () => {
  const sit = (recebidos: number, unicos: number, totalInformado: number | null, paginas = 1, recusados = 0) => ({ recebidos, unicos, recusados, totalInformado, paginas });
  assert.equal(continuarPeriodo({ recebidos: 100, paginas: 1, total: 300 }, { recebidos: 100, novos: 100 }), true);
  assert.equal(continuarPeriodo({ recebidos: 300, paginas: 3, total: 300 }, { recebidos: 100, novos: 100 }), false);
  assert.equal(continuarPeriodo({ recebidos: 100, paginas: 2, total: 300 }, { recebidos: 0, novos: 0 }), false);
  assert.equal(continuarPeriodo({ recebidos: 200, paginas: 2, total: null }, { recebidos: 100, novos: 0 }), false);
  assert.equal(continuarPeriodo({ recebidos: 200, paginas: 2, total: 900 }, { recebidos: 100, novos: 0 }), true, "com o total, uma página já vista (depois de dividir) não para o período");
  assert.equal(continuarPeriodo({ recebidos: 10, paginas: MAX_PAGINAS, total: 9999 }, { recebidos: 10, novos: 10 }), false);
  assert.equal(totalDoPeriodo(lerPaginaEmpenhos("[]", 2026), 1), 0, "o período vazio tem total 0");
  assert.equal(totalDoPeriodo(lerPaginaEmpenhos("[]", 2026), 2), null);
  assert.deepEqual(conferirLote(sit(300, 300, 300, 3)), { completo: true });
  assert.deepEqual(conferirLote(sit(300, 298, 300, 3, 2)), { completo: true }, "os recusados (sem número) também contam no total da Centi");
  const repetida = conferirLote(sit(300, 200, 300, 3));
  assert.equal(repetida.completo, false, "recebidos = total com uma página REPETIDA não é completo");
  assert.match((repetida as { motivo: string }).motivo, /200 distintos de 300 .*100 vieram repetidos/);
  assert.match((conferirLote(sit(200, 200, 300, 2)) as { motivo: string }).motivo, /200 distintos de 300/);
  assert.match((conferirLote(sit(200, 200, null, 2)) as { motivo: string }).motivo, /não informou/);
});

test("empenhos (D1 real): o TOTAL soma os períodos; o período dividido sai da conta e a releitura não duplica", async () => {
  const b = banco();
  const lote = b.novoLote();
  const jan = { inicio: "2026-01-01", fim: "2026-01-31" };
  const fev = { inicio: "2026-02-01", fim: "2026-02-28" };
  await guardar(b, lote, 1, [reg("1"), reg("2")], 2, jan);
  // Fevereiro: a 1ª página com recusado, e o mês é DIVIDIDO (grande demais na 2ª).
  await guardar(b, lote, 1, [reg("3"), reg("")], 5, fev, false);
  let l = b.raw.prepare("SELECT * FROM centi_lotes WHERE id = ?").get(lote) as Record<string, number>;
  assert.equal(l.total_informado, 7);
  assert.equal(l.recusados, 1);
  await b.db.batch([comandoDividirPeriodo(b.db, lote, fev), comandoRecontarLote(b.db, lote)]);
  l = b.raw.prepare("SELECT * FROM centi_lotes WHERE id = ?").get(lote) as Record<string, number>;
  assert.equal(l.total_informado, 2, "o fevereiro inteiro deixou de contar");
  assert.equal(l.recusados, 0);
  assert.equal(l.paginas, 1);
  // As metades: o "3" já estava no lote (não é novo); o total soma de novo.
  const r = await guardar(b, lote, 1, [reg("3"), reg("")], 2, { inicio: "2026-02-01", fim: "2026-02-14" });
  assert.equal(r.novos, 0);
  await guardar(b, lote, 1, [reg("4"), reg("5"), reg("6")], 3, { inicio: "2026-02-15", fim: "2026-02-28" });
  l = b.raw.prepare("SELECT * FROM centi_lotes WHERE id = ?").get(lote) as Record<string, number>;
  assert.equal(l.total_informado, 7);
  assert.equal(l.unicos, 6);
  assert.equal(l.recusados, 1);
  assert.deepEqual(conferirLote({ recebidos: l.recebidos, unicos: l.unicos, recusados: l.recusados, totalInformado: l.total_informado, paginas: l.paginas }), { completo: true });
  assert.deepEqual(await lidoNoPeriodo(b.db, lote, jan), { paginas: 1, recebidos: 2, total: 2 });
  assert.deepEqual(await lidoNoPeriodo(b.db, lote, fev), { paginas: 0, recebidos: 0, total: null });
  // Um período lido sem o total deixa o total do lote desconhecido (nunca uma soma que "bate" por faltar um período).
  await guardar(b, lote, 1, [reg("7")], null, { inicio: "2026-03-01", fim: "2026-03-31" });
  assert.equal((b.raw.prepare("SELECT total_informado t FROM centi_lotes WHERE id = ?").get(lote) as { t: number | null }).t, null);
});

test("empenhos (D1 real): páginas no staging, chave repetida no lote fica uma, contagem do lote", async () => {
  const b = banco();
  const lote = b.novoLote();
  await guardar(b, lote, 1, [reg("1"), reg("2"), reg("")], 4);
  await guardar(b, lote, 2, [reg("2"), reg("3")]);
  const l = b.raw.prepare("SELECT * FROM centi_lotes WHERE id = ?").get(lote) as Record<string, number>;
  assert.equal(l.paginas, 2);
  assert.equal(l.recebidos, 5);
  assert.equal(l.recusados, 1);
  assert.equal(l.unicos, 3);
  assert.equal(l.total_informado, 4);
  const s = b.raw.prepare("SELECT chave, pagina, valor_empenhado FROM empenhos_staging ORDER BY chave").all() as Record<string, unknown>[];
  assert.deepEqual(
    s.map((x) => `${x.chave}@${x.pagina}`),
    ["2026|PREFEITURA|1@1", "2026|PREFEITURA|2@1", "2026|PREFEITURA|3@2"],
  );
  assert.equal(s[0].valor_empenhado, 100);
});

test("empenhos (D1 real): 500 linhas numa página = um comando só (json_each), valores e textos intactos", async () => {
  const b = banco();
  const lote = b.novoLote();
  const regs = Array.from({ length: 500 }, (_, i) => reg(String(i + 1), { Historico: `Aquisição "${i}" — d'água`, ValorPago: "1.000,25" }));
  await guardar(b, lote, 1, regs, 500);
  const n = b.raw.prepare("SELECT COUNT(*) n, SUM(valor_pago) p FROM empenhos_staging").get() as { n: number; p: number };
  assert.equal(n.n, 500);
  assert.equal(n.p, 500_125);
  assert.equal((b.raw.prepare("SELECT historico FROM empenhos_staging WHERE numero = '7'").get() as { historico: string }).historico, `Aquisição "6" — d'água`);
});

test("empenhos (D1 real): página grande = vários comandos (cada JSON abaixo do teto do D1), sem perder nenhuma linha", async () => {
  const b = banco();
  const lote = b.novoLote();
  const longo = "X".repeat(2000);
  const regs = Array.from({ length: 900 }, (_, i) => reg(String(i + 1), { Historico: longo }));
  const p = lerPaginaEmpenhos(JSON.stringify(regs), 2026);
  const cmds = comandosGuardarPagina(b.db, lote, 1, p.linhas);
  assert.ok(cmds.length >= 3, `${cmds.length} comandos`);
  for (const c of cmds) assert.ok((c.toSQL().params as unknown[]).some((v) => typeof v === "string" && v.length <= MAX_JSON_GUARDA + 3000));
  await b.db.batch(cmds as never);
  assert.equal((b.raw.prepare("SELECT COUNT(*) n FROM empenhos_staging").get() as { n: number }).n, 900);
  assert.deepEqual(comandosGuardarPagina(b.db, lote, 1, []), []);
});

test("empenhos (D1 real): EXCLUIR a tentativa tira os passos, o staging e o lote; passos saem vários de uma vez", async () => {
  const b = banco();
  const lote = b.novoLote();
  await guardar(b, lote, 1, [reg("1"), reg("2")], 2);
  b.raw.prepare("INSERT INTO centi_lote_passos (lote_id, inicio, fim, pagina, estado) VALUES (?, '2026-01-01', '2026-01-07', 1, 'erro')").run(lote);
  const passos = b.raw.prepare("SELECT id, estado FROM centi_lote_passos WHERE lote_id = ? ORDER BY id").all(lote) as { id: number; estado: string }[];
  assert.equal((await comandoExcluirPassos(b.db, lote + 99, [passos[1].id])).length, 0, "de outro lote, não");
  assert.equal((await comandoExcluirPassos(b.db, lote, passos.map((x) => x.id))).length, 2, "o lido e o com erro, juntos");
  await b.db.batch([comandoRecontarLote(b.db, lote)]);
  const l = b.raw.prepare("SELECT paginas, recebidos, unicos FROM centi_lotes WHERE id = ?").get(lote) as { paginas: number; recebidos: number; unicos: number };
  assert.deepEqual({ ...l }, { paginas: 0, recebidos: 0, unicos: 2 }, "recontado: o staging fica para a releitura");
  // Um empenho já promovido por este lote fica — só perde a referência.
  b.raw.prepare("INSERT INTO empenhos (card_id, chave, ano, numero, orgao_gestor, lote_id) VALUES (1, '2026|P|9', 2026, '9', 'P', ?)").run(lote);
  const r = (await b.db.batch(comandosExcluirLote(b.db, lote) as never)) as unknown[][];
  assert.equal(r[4].length, 1);
  for (const t of ["centi_lotes", "centi_lote_passos", "empenhos_staging"]) assert.equal((b.raw.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n, 0, t);
  assert.deepEqual(b.raw.prepare("SELECT numero, lote_id FROM empenhos").all().map((x) => ({ ...x })), [{ numero: "9", lote_id: null }]);
});

test("empenhos (D1 real): PROMOVER grava, atualiza, marca removido o que sumiu e reativa o que voltou", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await guardar(b, l1, 1, [reg("1"), reg("2"), reg("3")], 3);
  const c1 = await contagemDaPromocao(b.db, l1, 1, 2026, 1);
  assert.deepEqual(c1, { inseridos: 3, atualizados: 0, removidos: 0, fora: 0 });
  await b.db.batch(comandosPromover(b.db, l1, 1, 2026, 1, "marcar", c1) as never);
  assert.equal((b.raw.prepare("SELECT COUNT(*) n FROM empenhos").get() as { n: number }).n, 3);
  assert.equal((b.raw.prepare("SELECT COUNT(*) n FROM empenhos_staging").get() as { n: number }).n, 0);

  // 2ª importação: o 3 sumiu, o 1 mudou de valor, o 4 é novo.
  const l2 = b.novoLote();
  await guardar(b, l2, 1, [reg("1", { ValorEmpenhado: 999 }), reg("2"), reg("4")], 3);
  const c2 = await contagemDaPromocao(b.db, l2, 1, 2026, 1);
  // Só o 1 MUDOU (o 2 veio igual — não conta nem é regravado).
  assert.deepEqual(c2, { inseridos: 1, atualizados: 1, removidos: 1, fora: 0 });
  await b.db.batch(comandosPromover(b.db, l2, 1, 2026, 1, "marcar", c2) as never);
  const e = Object.fromEntries((b.raw.prepare("SELECT numero, valor_empenhado, removido_em, lote_id FROM empenhos").all() as Record<string, unknown>[]).map((x) => [x.numero, x]));
  assert.equal(e["1"].valor_empenhado, 999);
  assert.equal(e["1"].lote_id, l2);
  assert.equal(e["2"].lote_id, l1, "o que veio igual não é regravado (guarda o lote e a data de antes)");
  assert.ok(e["3"].removido_em, "o que sumiu da Centi ganha removido_em (não é apagado)");
  assert.equal(e["4"].removido_em, null);
  const lote2 = b.raw.prepare("SELECT estado, inseridos, atualizados, removidos FROM centi_lotes WHERE id = ?").get(l2) as Record<string, unknown>;
  assert.deepEqual({ ...lote2 }, { estado: "promovido", inseridos: 1, atualizados: 1, removidos: 1 });

  // 3ª: o 3 volta — perde o removido_em.
  const l3 = b.novoLote();
  await guardar(b, l3, 1, [reg("1"), reg("2"), reg("3"), reg("4")], 4);
  await b.db.batch(comandosPromover(b.db, l3, 1, 2026, 1, "marcar", await contagemDaPromocao(b.db, l3, 1, 2026, 1)) as never);
  assert.equal((b.raw.prepare("SELECT removido_em FROM empenhos WHERE numero = '3'").get() as { removido_em: string | null }).removido_em, null);
});

test("empenhos (D1 real): outro ano nunca é marcado como removido; lote fechado sem promover não toca na tabela", async () => {
  const b = banco();
  b.raw.exec("INSERT INTO empenhos (card_id, chave, ano, numero, orgao_gestor, orgao_id) VALUES (1, '2025|PREFEITURA|1', 2025, '1', 'PREFEITURA', 1)");
  const l = b.novoLote();
  await guardar(b, l, 1, [reg("9")], 1);
  await b.db.batch(comandosPromover(b.db, l, 1, 2026, 1, "marcar", await contagemDaPromocao(b.db, l, 1, 2026, 1)) as never);
  assert.equal((b.raw.prepare("SELECT removido_em FROM empenhos WHERE ano = 2025").get() as { removido_em: string | null }).removido_em, null);

  const parcial = b.novoLote();
  await guardar(b, parcial, 1, [reg("50")], 9);
  await b.db.batch(comandosFecharLote(b.db, parcial, "parcial", "Faltam registros") as never);
  assert.equal((b.raw.prepare("SELECT COUNT(*) n FROM empenhos WHERE numero = '50'").get() as { n: number }).n, 0);
  assert.equal((b.raw.prepare("SELECT COUNT(*) n FROM empenhos_staging").get() as { n: number }).n, 0);
  assert.equal((b.raw.prepare("SELECT estado FROM centi_lotes WHERE id = ?").get(parcial) as { estado: string }).estado, "parcial");
  // Página que chega DEPOIS de fechado não reabre a contagem.
  await guardar(b, parcial, 2, [reg("51")]);
  assert.equal((b.raw.prepare("SELECT recebidos FROM centi_lotes WHERE id = ?").get(parcial) as { recebidos: number }).recebidos, 1);
});

test("empenhos (D1 real): a SOMA do lote, os valores SUSPEITOS e a QUEDA em relação à última importação", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await guardar(b, l1, 1, [reg("1", { ValorEmpenhado: "100,000" }), reg("2", { ValorEmpenhado: "50,500" })], 2);
  assert.equal((b.raw.prepare("SELECT soma FROM centi_lotes WHERE id = ?").get(l1) as { soma: number }).soma, 150.5);
  assert.equal((b.raw.prepare("SELECT soma FROM centi_lote_passos WHERE lote_id = ?").get(l1) as { soma: number }).soma, 150.5);
  assert.equal(await valoresSuspeitos(b.db, l1), 0);
  await b.db.batch(comandosPromover(b.db, l1, 1, 2026, 1, "marcar", await contagemDaPromocao(b.db, l1, 1, 2026, 1)) as never);

  const l2 = b.novoLote();
  await guardar(b, l2, 1, [reg("1", { ValorEmpenhado: "-1,000" }), reg("2", { ValorEmpenhado: "2.000.000.000,000" })], 2);
  assert.equal(await valoresSuspeitos(b.db, l2), 2);
  assert.match(motivoValoresSuspeitos(2) ?? "", /2 empenho/);
  assert.equal(motivoValoresSuspeitos(0), null);

  const ant = await ultimoPromovido(b.db, 1, 2026, l2);
  assert.deepEqual({ ...ant }, { soma: 150.5, unicos: 2 });
  assert.equal(await ultimoPromovido(b.db, 1, 2025, l2), null, "outro ano não serve de base");
  assert.equal(quedaSuspeita(null, { soma: 1, unicos: 1 }), null);
  assert.equal(quedaSuspeita({ soma: 100, unicos: 10 }, { soma: 85, unicos: 10 }), null);
  assert.match(quedaSuspeita({ soma: 100, unicos: 10 }, { soma: 70, unicos: 10 }) ?? "", /soma empenhada caiu/);
  assert.match(quedaSuspeita({ soma: 100, unicos: 100 }, { soma: 100, unicos: 80 }) ?? "", /empenhos caíram de 100 para 80/);
  // As REGRAS do card: o limite próprio e o 0 (não confere).
  assert.match(quedaSuspeita({ soma: 100, unicos: 10 }, { soma: 85, unicos: 10 }, { soma: 90, registros: 90 }) ?? "", /soma empenhada caiu/);
  assert.equal(quedaSuspeita({ soma: 100, unicos: 100 }, { soma: 1, unicos: 1 }, { soma: 0, registros: 0 }), null);
});

test("empenhos (D1 real): uma ABA por vez conduz o lote; a trava vencida ou o lote fechado mudam isso", async () => {
  const b = banco();
  const l = b.novoLote();
  const a = "aba-aaaaaaaaaaaaaaaa";
  const outra = "aba-bbbbbbbbbbbbbbbb";
  assert.equal((await comandoConduzir(b.db, l, a)).length, 1, "livre: a 1ª aba entra");
  assert.equal((await comandoConduzir(b.db, l, a)).length, 1, "a mesma aba renova");
  assert.equal((await comandoConduzir(b.db, l, outra)).length, 0, "outra aba não entra");
  b.raw.prepare("UPDATE centi_lotes SET conduzindo_ate = datetime('now', '-1 seconds') WHERE id = ?").run(l);
  assert.equal((await comandoConduzir(b.db, l, outra)).length, 1, "a trava venceu: a outra assume");
  await b.db.batch(comandosFecharLote(b.db, l, "cancelado", "x") as never);
  const f = b.raw.prepare("SELECT condutor, conduzindo_ate FROM centi_lotes WHERE id = ?").get(l) as Record<string, unknown>;
  assert.deepEqual({ ...f }, { condutor: null, conduzindo_ate: null }, "fechar solta a trava");
  assert.equal((await comandoConduzir(b.db, l, a)).length, 0, "lote fechado não é conduzido");
});

test("empenhos (D1 real): o LEITOR novo regrava tudo; o mesmo leitor com dados iguais não regrava nada", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await guardar(b, l1, 1, [reg("1"), reg("2")], 2);
  await b.db.batch(comandosPromover(b.db, l1, 1, 2026, 1, "marcar", await contagemDaPromocao(b.db, l1, 1, 2026, 1)) as never);
  const l2 = b.novoLote();
  await guardar(b, l2, 1, [reg("1"), reg("2")], 2);
  assert.deepEqual(await contagemDaPromocao(b.db, l2, 1, 2026, 1), { inseridos: 0, atualizados: 0, removidos: 0, fora: 0 });
  const c = await contagemDaPromocao(b.db, l2, 1, 2026, 2);
  assert.deepEqual(c, { inseridos: 0, atualizados: 2, removidos: 0, fora: 0 }, "a versão do leitor entra na comparação");
  await b.db.batch(comandosPromover(b.db, l2, 1, 2026, 2, "marcar", c) as never);
  assert.deepEqual(
    b.raw.prepare("SELECT leitor, lote_id FROM empenhos ORDER BY numero").all().map((x) => ({ ...x })),
    [
      { leitor: 2, lote_id: l2 },
      { leitor: 2, lote_id: l2 },
    ],
  );
  assert.equal(LEITOR_EMPENHOS, 1);
});

test("empenhos (D1 real): a REGRA do card — apagar o que a Centi não traz mais; e a mesma chave em DOIS cards", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await guardar(b, l1, 1, [reg("1"), reg("2")], 2);
  await b.db.batch(comandosPromover(b.db, l1, 1, 2026, 1, "marcar", await contagemDaPromocao(b.db, l1, 1, 2026, 1)) as never);
  const l2 = b.novoLote();
  await guardar(b, l2, 1, [reg("1")], 1);
  await b.db.batch(comandosPromover(b.db, l2, 1, 2026, 1, "apagar", await contagemDaPromocao(b.db, l2, 1, 2026, 1)) as never);
  assert.deepEqual(b.raw.prepare("SELECT numero FROM empenhos WHERE card_id = 1").all().map((x) => ({ ...x })), [{ numero: "1" }], "o 2 saiu do banco");
  // O card 2 tem o próprio vínculo e a própria tabela: a mesma chave entra de novo, sem tocar no card 1.
  b.raw.exec("INSERT INTO empenho_card_vinculos (card_id, orgao_gestor, orgao_id) VALUES (2, 'PREFEITURA', 1)");
  const l3 = b.novoLote(2026, 2);
  await guardar(b, l3, 1, [reg("1"), reg("5")], 2);
  await b.db.batch(comandosPromover(b.db, l3, 2, 2026, 1, "marcar", await contagemDaPromocao(b.db, l3, 2, 2026, 1)) as never);
  assert.equal((b.raw.prepare("SELECT COUNT(*) n FROM empenhos WHERE card_id = 2").get() as { n: number }).n, 2);
  assert.equal((b.raw.prepare("SELECT COUNT(*) n FROM empenhos WHERE card_id = 1").get() as { n: number }).n, 1);
  // Sem vínculo no card, nada entra.
  const l4 = b.novoLote(2025, 2);
  await guardar(b, l4, 1, [reg("9", { OrgaoGestor: "OUTRO" })], 1);
  const c = await contagemDaPromocao(b.db, l4, 2, 2025, 1);
  assert.deepEqual(c, { inseridos: 0, atualizados: 0, removidos: 0, fora: 1 });
  // Excluir o card exclui os empenhos e as importações dele (cascata).
  b.raw.exec("DELETE FROM empenho_cards WHERE id = 2");
  assert.equal((b.raw.prepare("SELECT COUNT(*) n FROM empenhos WHERE card_id = 2").get() as { n: number }).n, 0);
  assert.equal((b.raw.prepare("SELECT COUNT(*) n FROM centi_lotes WHERE card_id = 2").get() as { n: number }).n, 0);
});
