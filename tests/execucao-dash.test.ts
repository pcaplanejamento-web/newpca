import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import {
  anosDoIntervalo,
  CHAVE_SEM_EMPENHO,
  DIMS_EXEC,
  demonstrativo,
  selecaoDaLinha,
  calcular,
  confianca,
  derivados,
  diaDoIso,
  ESCALA,
  empenhoExec,
  isoDoDia,
  liquidacaoExec,
  montarBase,
  opcoesDim,
  type PacoteExec,
  pagamentoExec,
  reais,
  ROTULO_SEM_EMPENHO,
  selecaoNoIntervalo,
  serie,
  sparks,
} from "../src/lib/execucao-dash-core.ts";
import { consultaAnosExecucao, consultaMetaExecucao, consultaVersaoExecucao, EMP_POR_PEDACO, textoPacoteExecucao } from "../src/lib/execucao-sql.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

const TUDO = { liquidacoes: true, pagamentos: true };

/**
 * O cenário: PMRV (órgão 1, unidades SEFAZ 5 e SAUDE 6 — a SAUDE repete a sigla na unidade 7 do FMS), FMS (órgão 2).
 * Cards: 1 e 2 de empenhos (o mesmo empenho 9 nos dois — conta uma vez), 3 de liquidações, 4 de pagamentos.
 */
function banco() {
  const raw = bancoMigrado();
  raw.exec("INSERT INTO orgaos (id, nome, sigla) VALUES (1, 'Prefeitura', 'PMRV'), (2, 'Fundo de Saúde', 'FMS')");
  raw.exec("INSERT INTO reparticoes (id, codigo, nome, orgao_id) VALUES (5, 'SEFAZ', 'Fazenda', 1), (6, 'SAUDE', 'Saúde', 1), (7, 'SAUDE', 'Saúde FMS', 2)");
  raw.exec("INSERT INTO empenho_cards (id, nome) VALUES (1, 'A'), (2, 'B')");
  raw.exec("INSERT INTO empenho_cards (id, nome, tipo, endpoint) VALUES (3, 'L', 'liquidacoes', 'getliquidacoes'), (4, 'P', 'pagamentos', 'GetOrdempaPamento')");
  const db = drizzle(d1Sobre(raw) as never, { schema });
  const emp = (card: number, ano: number, numero: string, data: string | null, vb: number, va: number, org: number, rep: number | null, extra: Record<string, string> = {}, removido = false) =>
    raw
      .prepare(
        "INSERT INTO empenhos (card_id, chave, ano, numero, data, orgao_gestor, fornecedor, elemento, fonte, valor_empenhado, valor_anulado, valor_liquidado, valor_pago, saldo_pagar, orgao_id, reparticao_id, removido_em) VALUES (?, ?, ?, ?, ?, 'G', ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)",
      )
      .run(card, `${ano}|G|${numero}`, ano, numero, data, extra.fornecedor ?? "FORN", extra.elemento ?? null, extra.fonte ?? "F1", vb, va, org, rep, removido ? "2025-01-01" : null);
  let chave = 0;
  const liq = (ano: number, numero: string, data: string | null, v: number, a: number, org = 1, rep: number | null = 5, card = 3, ch?: string) =>
    raw
      .prepare("INSERT INTO liquidacoes (card_id, chave, ano, data, numero_empenho, valor, valor_anulado, orgao_id, reparticao_id, id_orgao_centi) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 2)")
      .run(card, ch ?? `L${++chave}`, ano, data, numero, v, a, org, rep);
  const pag = (ano: number, numero: string, data: string | null, v: number, rt: number, anulado = 0, org = 1, rep: number | null = 5) =>
    raw
      .prepare("INSERT INTO pagamentos (card_id, chave, ano, data, numero_empenho, valor, valor_retencao, valor_liquido, anulado, orgao_id, reparticao_id, id_orgao_centi) VALUES (4, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2)")
      .run(`P${++chave}`, ano, data, numero, v, rt, v - rt, anulado, org, rep);
  return { raw, db, emp, liq, pag };
}

async function pacote(b: ReturnType<typeof banco>, anos: number[], escopo: Parameters<typeof textoPacoteExecucao>[2] = null, fontes = TUDO): Promise<PacoteExec> {
  const extra = `,"anos":${JSON.stringify(anos)},"disponiveis":[],"fontes":${JSON.stringify(fontes)},"meta":[]`;
  const t = await textoPacoteExecucao(b.db, anos, escopo, fontes, extra);
  assert.ok(t);
  return JSON.parse(t) as PacoteExec;
}

function cenario() {
  const b = banco();
  b.emp(1, 2025, "9", "2025-03-01", 1000.555, 0.555, 1, 5, { elemento: "3390.30" });
  b.emp(2, 2025, "9", "2025-03-01", 1000.555, 0.555, 1, 5, { elemento: "3390.30" }); // mesmo empenho em outro card
  b.emp(1, 2025, "10", "2025-04-10", 500, 100, 1, 6, { elemento: "3390.39", fornecedor: "OUTRO" });
  b.emp(1, 2025, "11", "2025-05-02", 300, 0, 2, 7);
  b.emp(1, 2025, "12", null, 50, 0, 2, null); // sem data, vinculado só ao órgão
  b.emp(1, 2024, "8", "2024-11-20", 700, 0, 1, 5); // de 2024 — só classifica os restos a pagar
  b.emp(1, 2025, "99", "2025-06-01", 999, 0, 1, 5, {}, true); // removido na Centi
  b.liq(2025, "9", "2025-03-05", 600, 0);
  b.liq(2025, "9", "2025-03-05", 200, 50); // mesmo dia — agrupado
  b.liq(2025, "10", "2025-04-20", 300, 0, 1, 6);
  b.liq(2025, "8", "2025-02-01", 700, 0); // resto a pagar (empenho de 2024)
  b.liq(2025, "777", "2025-02-02", 40, 0, 2, null); // sem empenho no sistema
  b.liq(2026, "9", "2026-01-10", 100, 0); // execução de 2026 de um empenho de 2025 (a safra)
  b.pag(2025, "9", "2025-03-10", 500, 50);
  b.pag(2025, "9", "2025-03-11", 80, 0, 1); // anulado
  b.pag(2025, "8", "2025-02-05", 700, 0);
  b.pag(2025, "777", "2025-02-06", 40, 0, 0, 2, null);
  return b;
}

test("execução (SQL): o universo — empenho repetido entre cards conta uma vez, removido fora, restos a pagar classificados", async () => {
  const b = cenario();
  const p = await pacote(b, [2025]);
  const base = montarBase(p);
  const nums = base.emp.numero.slice().sort();
  assert.deepEqual(nums, ["10", "11", "12", "8", "9"], "o 9 uma vez, o 99 removido fora, o 8 (2024) só para classificar");
  const i8 = base.emp.numero.indexOf("8");
  assert.equal(base.emp.r[i8], 0, "o empenho de 2024 não entra no empenhado");
  const i9 = base.emp.numero.indexOf("9");
  assert.equal(base.emp.bruto[i9], 1000.555 * ESCALA, "valores em inteiros de 1/10.000");
  // As unidades de MESMA sigla em órgãos diferentes ganham o órgão no rótulo (os rótulos são únicos).
  const unidades = (p.dic.unidade ?? []).map(([, v]) => v);
  assert.ok(unidades.includes("SAUDE — PMRV") && unidades.includes("SAUDE — FMS"), JSON.stringify(unidades));
  assert.ok(unidades.includes("FMS"), "vinculado só ao órgão = a sigla do órgão");
  assert.equal(new Set(unidades).size, unidades.length);
  // Só os eventos dos anos pedidos (o de 2026 do empenho 9 não vem); o sem empenho chega com o órgão.
  assert.ok(p.liq.every((t) => t[2] == null || Number(t[2]) < 9497), "nenhum evento de 2026");
  assert.ok(p.liq.some((t) => t[0] === -1 && t[1] === 2), "sem empenho: o órgão do registro");
});

test("execução (núcleo): os números — cada etapa pela própria data, sem data, sem empenho, anulações e a soma de cada parte", async () => {
  const b = cenario();
  const base = montarBase(await pacote(b, [2025]));
  const mov = calcular(base, {}, {});
  const t = mov.totais;
  assert.equal(t.empenhos, 4, "9, 10, 11 e 12 (o 8 é de 2024, o 99 removido)");
  assert.equal(t.empBruto, 18_505_550, "inteiros exatos (sem a deriva do ponto flutuante)");
  assert.equal(t.empAnulado, 1_005_550);
  assert.equal(reais(t.empenhado), 1750);
  assert.equal(reais(t.liquidado), 600 + 150 + 300 + 700 + 40, "movimento: os de 2025, inclusive resto a pagar e sem empenho");
  assert.equal(t.liquidacoes, 5);
  assert.equal(reais(t.pago), 500 + 700 + 40, "o anulado fica fora do pago");
  assert.equal(reais(t.pagAnulado), 80);
  assert.equal(t.pagAnuladas, 1);
  assert.equal(reais(t.retido), 50);
  assert.equal(reais(t.pagoLiquido), 450 + 700 + 40);
  assert.equal(t.semEmpenho, 2);
  assert.equal(mov.semData.empenhos, 1);
  assert.equal(derivados(t).pctPago, t.pago / t.empenhado);
  // O período: só março (o empenho 9 e a execução dele no mês).
  const marco = calcular(base, { de: "2025-03-01", ate: "2025-03-31" }, {});
  assert.equal(marco.totais.empenhos, 1);
  assert.equal(reais(marco.totais.liquidado), 750);
  assert.equal(marco.semData.empenhos, 0, "com período, o sem data não entra");
});

test("execução (núcleo): a série fecha com os totais; a origem de um ponto = o ponto; granularidade forçada", async () => {
  const b = cenario();
  const base = montarBase(await pacote(b, [2025]));
  {
    const visao = "movimento";
    const c = calcular(base, {}, {});
    for (const g of ["auto", "dia", "semana", "mes"] as const) {
      const s = serie(base, c, {}, g, "2025-12-31");
      const ult = s.pontos.at(-1);
      assert.ok(ult, `${visao}/${g}`);
      const semDataEmp = c.sel.emp.reduce((x, i) => x + (base.emp.dia[i] < -1e9 ? base.emp.bruto[i] - base.emp.anulado[i] : 0), 0);
      assert.equal(ult.acEmpenhado, c.totais.empenhado - semDataEmp, `${visao}/${g}: o acumulado = o empenhado com data`);
      assert.equal(ult.acLiquidado, c.totais.liquidado, `${visao}/${g}`);
      assert.equal(ult.acPago, c.totais.pago, `${visao}/${g}`);
      for (const pt of s.pontos) {
        const o = selecaoNoIntervalo(base, c.sel, pt.de, pt.ate);
        const soma = o.liq.reduce((x, k) => x + base.liq.valor[k] - base.liq.anulado[k], 0);
        assert.equal(soma, pt.liquidado, `${visao}/${g}/${pt.chave}: origem = ponto`);
        const somaP = o.pag.reduce((x, k) => x + base.pag.pago[k], 0);
        assert.equal(somaP, pt.pago);
        assert.equal(o.emp.length, pt.qEmp, `${visao}/${g}/${pt.chave}: os empenhos do ponto`);
        assert.equal(o.liq.reduce((x, k) => x + base.liq.qtd[k], 0), pt.qLiq);
        assert.equal(o.pag.reduce((x, k) => x + base.pag.qtd[k], 0), pt.qPag);
        // O acumulado até o ponto = a origem desde o 1º balde até ele (o "Acumulado até aqui" da origem).
        const ac = selecaoNoIntervalo(base, c.sel, s.pontos[0].de, pt.ate);
        assert.equal(ac.liq.reduce((x, k) => x + base.liq.valor[k] - base.liq.anulado[k], 0), pt.acLiquidado);
        assert.equal(ac.pag.reduce((x, k) => x + base.pag.pago[k], 0), pt.acPago);
      }
    }
  }
  const c = calcular(base, {}, {});
  assert.equal(serie(base, c, {}, "mes", "2025-12-31").granularidade, "mes");
  {
    // O ano atual vai só até hoje (o futuro não tem execução); um ano passado, inteiro; período todo no futuro, como pedido.
    const ano = serie(base, c, { de: "2025-01-01", ate: "2025-12-31" }, "mes", "2025-06-15");
    assert.equal(ano.ate, "2025-06-15");
    assert.equal(ano.pontos.at(-1)?.atual, true);
    assert.equal(serie(base, c, { de: "2025-01-01", ate: "2025-12-31" }, "mes", "2026-03-01").ate, "2025-12-31");
    assert.equal(serie(base, c, { de: "2030-01-01", ate: "2030-12-31" }, "mes", "2025-06-15").ate, "2030-12-31");
  }
  assert.equal(serie(base, c, { de: "2025-03-01", ate: "2025-03-31" }, "auto", "2025-12-31").granularidade, "dia");
});

test("execução (núcleo): os filtros — conectados, sem contar duas vezes, sem empenho como opção, ordem e rótulos", async () => {
  const b = cenario();
  const base = montarBase(await pacote(b, [2025]));
  const tudo = calcular(base, {}, {});
  const el = opcoesDim(base, tudo, {}, "elemento");
  const r30 = el.find((o) => o.rotulo === "3390.30");
  assert.ok(r30);
  const sem = el.at(-1);
  assert.equal(sem?.rotulo, ROTULO_SEM_EMPENHO, "o sem empenho por último");
  // Filtrar o elemento 3390.30: só o empenho 9 e a execução dele.
  const f = { elemento: [r30.chave] };
  const c = calcular(base, {}, f);
  assert.equal(c.totais.empenhos, 1);
  assert.equal(reais(c.totais.liquidado), 750);
  assert.equal(reais(c.totais.pago), 500);
  // As opções do próprio elemento continuam todas (o filtro da dimensão não a esconde), a escolhida zerada fica.
  const op = opcoesDim(base, c, f, "elemento");
  assert.ok(op.length >= 3);
  // Somando por elemento, cada parte fecha com o todo (nada conta duas vezes).
  let soma = 0;
  for (const o of opcoesDim(base, tudo, {}, "elemento")) soma += calcular(base, {}, { elemento: [o.chave] }).totais.liquidado;
  assert.equal(soma, tudo.totais.liquidado);
  // O sem empenho como filtro: só os registros sem empenho.
  const s = calcular(base, {}, { fonte: [CHAVE_SEM_EMPENHO] });
  assert.equal(s.totais.empenhos, 0);
  assert.equal(reais(s.totais.liquidado), 40);
  // O órgão do sem empenho vem do registro.
  const fms = calcular(base, {}, { orgao: ["2"] });
  assert.equal(reais(fms.totais.liquidado), 40);
  assert.equal(fms.totais.empenhos, 2, "11 e 12 são do FMS");
});

test("execução (SQL): escopo, telas sem acesso, anos, versão e a situação dos cards", async () => {
  const b = cenario();
  const so5 = montarBase(await pacote(b, [2025], { unidades: [5], orgaos: [] }));
  assert.deepEqual(so5.emp.numero.filter((_, i) => so5.emp.r[i]).sort(), ["9"], "só os da SEFAZ");
  assert.ok(so5.liq.ei.every((e) => e >= 0), "o sem empenho do FMS não aparece");
  const semPag = await pacote(b, [2025], null, { liquidacoes: true, pagamentos: false });
  assert.equal(semPag.pag.length, 0, "sem a tela de Pagamentos, nenhum pagamento sai do servidor");
  assert.deepEqual(await consultaAnosExecucao(b.db, null), [2025, 2024]);
  const v1 = await consultaVersaoExecucao(b.db);
  b.raw.exec("INSERT INTO centi_lotes (card_id, ano, estado, concluido_em) VALUES (3, 2025, 'promovido', '2025-06-01 10:00:00')");
  const v2 = await consultaVersaoExecucao(b.db);
  assert.notEqual(v1, v2, "uma importação promovida muda a versão");
  b.raw.exec("UPDATE empenho_cards SET ultimo_status = 'falhou' WHERE id = 4");
  const meta = await consultaMetaExecucao(b.db);
  const liq = meta.find((m) => m.tipo === "liquidacoes");
  assert.equal(liq?.atualizado, "2025-06-01 10:00:00");
  const av = confianca(meta, TUDO, Date.parse("2025-06-10T00:00:00Z")).avisos.join(" | ");
  assert.match(av, /pagamentos com a última importação com erro/);
  assert.match(av, /liquidações tem mais de 2 dias/);
  assert.match(av, /Nenhuma importação de empenhos/);
});

test("execução (núcleo): datas, linhas da origem e sparks", async () => {
  assert.equal(isoDoDia(diaDoIso("2025-03-05") ?? 0), "2025-03-05");
  assert.equal(diaDoIso("2025-13-40"), null);
  const b = cenario();
  const base = montarBase(await pacote(b, [2025]));
  const c = calcular(base, {}, {});
  const e = empenhoExec(base, base.emp.numero.indexOf("10"));
  assert.equal(e.data, "2025-04-10");
  assert.equal(e.valorEmpenhado, 500);
  assert.equal(e.unidade, "SAUDE — PMRV");
  const l = Array.from(c.sel.liq, (k) => liquidacaoExec(base, k));
  assert.ok(l.some((x) => x.ei === -1 && x.orgao === "FMS" && x.numero === null));
  const p = Array.from(c.sel.pag, (k) => pagamentoExec(base, k));
  assert.ok(p.some((x) => x.retido === 50 && x.liquido === 450));
  const s = sparks(base, c.sel, "2025-03-15", 4);
  assert.equal(s.empenhado.length, 4);
  assert.equal(reais(s.empenhado[1]), 1000, "o 9 (sábado, 01/03) na semana de 23/02 a 01/03 (domingo a sábado)");
  assert.equal(reais(s.empenhado[2] + s.empenhado[3]), 0);
});

test("execução (SQL): volume — milhares de empenhos, liquidações e pagamentos em pedaços, sem perder nada", async () => {
  const b = banco();
  const ins = b.raw.prepare(
    "INSERT INTO empenhos (card_id, chave, ano, numero, data, orgao_gestor, fornecedor, elemento, valor_empenhado, orgao_id, reparticao_id) VALUES (1, ?, 2025, ?, ?, 'G', ?, ?, ?, 1, 5)",
  );
  const insL = b.raw.prepare("INSERT INTO liquidacoes (card_id, chave, ano, data, numero_empenho, valor, orgao_id, reparticao_id, id_orgao_centi) VALUES (3, ?, 2025, ?, ?, 1.5, 1, 5, 2)");
  const insP = b.raw.prepare(
    "INSERT INTO pagamentos (card_id, chave, ano, data, numero_empenho, valor, valor_liquido, orgao_id, reparticao_id, id_orgao_centi) VALUES (4, ?, 2025, ?, ?, 1.25, 1.25, 1, 5, 2)",
  );
  const N = EMP_POR_PEDACO + 2000;
  b.raw.exec("BEGIN");
  for (let i = 0; i < N; i++) {
    const d = `2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
    ins.run(`2025|G|${i}`, String(i), d, `F${i % 900}`, `E${i % 40}`, 10);
    insL.run(`L${i}`, d, String(i));
    insL.run(`M${i}`, `2025-12-${String((i % 28) + 1).padStart(2, "0")}`, String(i));
    insP.run(`P${i}`, d, String(i));
  }
  b.raw.exec("COMMIT");
  const t0 = performance.now();
  const base = montarBase(await pacote(b, [2025]));
  const ms = performance.now() - t0;
  assert.equal(base.emp.n, N);
  const c = calcular(base, {}, {});
  assert.equal(reais(c.totais.empenhado), N * 10);
  assert.equal(c.totais.liquidacoes, 2 * N);
  assert.equal(reais(c.totais.liquidado), 2 * N * 1.5);
  assert.equal(reais(c.totais.pago), N * 1.25);
  const t1 = performance.now();
  calcular(base, { de: "2025-03-01", ate: "2025-06-30" }, { elemento: ["1", "2"] });
  const msCalc = performance.now() - t1;
  assert.ok(ms < 20_000, `leitura em ${ms} ms`);
  assert.ok(msCalc < 500, `cálculo em ${msCalc} ms`);
});

test("execução (SQL): pedaços pequenos — a costura não repete nem perde grupo (inclusive os sem data)", async () => {
  const b = cenario();
  // Grupos sem data (o de 2026 fica fora: só os anos pedidos) — a ordem dos pedaços não pode empatar.
  b.liq(2025, "10", null, 11, 0, 1, 6);
  b.liq(2026, "10", null, 13, 0, 1, 6);
  b.pag(2025, "10", null, 7, 0, 0, 1, 6);
  const extra = `,"anos":[2025],"disponiveis":[],"fontes":${JSON.stringify(TUDO)},"meta":[]`;
  const inteiro = JSON.parse((await textoPacoteExecucao(b.db, [2025], null, TUDO, extra)) ?? "{}") as PacoteExec;
  const picado = JSON.parse((await textoPacoteExecucao(b.db, [2025], null, TUDO, extra, { emp: 1, eventos: 1 })) ?? "{}") as PacoteExec;
  const ord = (l: unknown[][]) => l.map((t) => JSON.stringify(t)).sort();
  assert.deepEqual(ord(picado.emp), ord(inteiro.emp));
  assert.deepEqual(ord(picado.liq), ord(inteiro.liq));
  assert.deepEqual(ord(picado.pag), ord(inteiro.pag));
  assert.equal(new Set(ord(picado.liq)).size, picado.liq.length, "nenhum grupo repetido");
  assert.ok(picado.liq.some((t) => t[2] == null), "o grupo sem data está lá");
});

test("execução (núcleo): o filtro de TIPO — Nota de Empenho × Restos a Pagar (a régua das tabelas)", async () => {
  const b = cenario();
  const base = montarBase(await pacote(b, [2025]));
  const todos = calcular(base, {}, {});
  const ne = calcular(base, {}, {}, ["ne"]);
  const rp = calcular(base, {}, {}, ["rp"]);
  // RP = a execução de empenhos de anos anteriores (o 8, de 2024) e a do empenho não importado (o 777); sem empenhado.
  assert.equal(rp.totais.empenhado, 0);
  assert.equal(reais(rp.totais.liquidado), 700 + 40);
  assert.equal(reais(rp.totais.pago), 700 + 40);
  // NE + RP = todos (as liquidações e os pagamentos se dividem; os empenhos ficam com a NE).
  assert.equal(ne.totais.liquidado + rp.totais.liquidado, todos.totais.liquidado);
  assert.equal(ne.totais.pago + rp.totais.pago, todos.totais.pago);
  assert.equal(ne.totais.empenhado, todos.totais.empenhado);
});

test("execução (núcleo): as opções do tipo (conectadas) e os anos que o período carrega", async () => {
  const b = cenario();
  const base = montarBase(await pacote(b, [2025]));
  const c = calcular(base, {}, {}, ["rp"]);
  // As opções do tipo ignoram o próprio filtro: as duas aparecem com a contagem.
  assert.ok((c.opcoesTipo.get("ne") ?? 0) > 0 && (c.opcoesTipo.get("rp") ?? 0) > 0);
  assert.deepEqual(calcular(base, {}, {}, ["ne", "rp"]).totais, calcular(base, {}, {}).totais, "as duas = todos");
  assert.deepEqual(anosDoIntervalo({}, [2024, 2026, 2025]), [2026, 2025, 2024]);
  assert.deepEqual(anosDoIntervalo({ de: "2025-03-01", ate: "2025-03-31" }, [2024, 2025, 2026]), [2025]);
  assert.deepEqual(anosDoIntervalo({ de: "2024-12-01", ate: "2026-01-31" }, [2024, 2025, 2026]), [2026, 2025, 2024]);
  assert.deepEqual(anosDoIntervalo({ de: "2030-01-01", ate: "2030-12-31" }, [2024, 2025]), [2025], "sem dados no período: o mais recente (o intervalo zera)");
});

test("execução (núcleo): o demonstrativo — a soma das linhas = as KPIs, em toda dimensão e no mês; a origem de uma linha = a linha", async () => {
  const b = cenario();
  const base = montarBase(await pacote(b, [2025]));
  const c = calcular(base, {}, {});
  for (const d of [...DIMS_EXEC, "mes" as const]) {
    const l = demonstrativo(base, c, d);
    const soma = (k: "empenhado" | "liquidado" | "pago" | "retido") => l.reduce((t, x) => t + x[k], 0);
    assert.equal(soma("empenhado"), c.totais.empenhado, d);
    assert.equal(soma("liquidado"), c.totais.liquidado, d);
    assert.equal(soma("pago"), c.totais.pago, d);
    assert.equal(soma("retido"), c.totais.retido, d);
    const x = l[0];
    const s = selecaoDaLinha(base, c.sel, d, x.chave);
    const liq = Array.from(s.liq).reduce((t, k) => t + base.liq.valor[k] - base.liq.anulado[k], 0);
    assert.equal(liq, x.liquidado, `origem ${d}`);
  }
  // O sem empenho fica no fim, com o rótulo próprio.
  const porElemento = demonstrativo(base, c, "elemento");
  assert.equal(porElemento.at(-1)?.rotulo, ROTULO_SEM_EMPENHO);
});
