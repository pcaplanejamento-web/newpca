import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DfdPainel, ProtocoloPainel } from "../src/lib/mesa-dashboard.ts";
import {
  type Atividade,
  atividadeDaTupla,
  baldesEvolucao,
  COLUNAS_METRICAS,
  colunasMetricas,
  correcoesPorColuna,
  desempenhoPorPessoa,
  dfdsDoRecorteMetricas,
  evolucaoMetricas,
  type FiltroMetricas,
  filtroMetricasPadrao,
  naturezaDoProtocolo,
  navegarRef,
  noPeriodo,
  opcoesNatureza,
  origemCorrecoes,
  origemDaCelula,
  origemDoBalde,
  protocolosDaPessoa,
  recorteFiltrado,
  recorteMetricas,
  resumoMetricas,
  rotuloPeriodo,
  situacoesPorPessoa,
  tabelaMetricas,
  tuplaDaAtividade,
} from "../src/lib/mesa-metricas.ts";

// Hoje = segunda-feira 28/09/2026 (Brasília).
const HOJE = "2026-09-28";

let seq = 0;
/** Protocolo da Mesa; `criadoEm` em UTC (como o banco). */
const P = (criadoEm: string | null, extra: Partial<ProtocoloPainel> = {}): ProtocoloPainel => ({
  id: ++seq,
  numero: `P${seq}`,
  assunto: "INCLUSÃO DE DEMANDA NO PCA",
  anoPca: 2027,
  criadoEm,
  valor: 0,
  responsavelId: null,
  distribuidorId: null,
  situacaoId: null,
  estado: "regular",
  ...extra,
});
const D = (protocoloId: number | null, tipo: string | null, itens: number, valor: number): DfdPainel => ({
  unidadeId: 1,
  unidade: "SMS",
  unidadeNome: null,
  protocoloId,
  tipo,
  itens,
  valor,
});
const F = (f: Partial<FiltroMetricas> = {}): FiltroMetricas => ({ ...filtroMetricasPadrao(HOJE), ...f });
const soma = (xs: { valor: number }[]) => xs.reduce((s, x) => s + x.valor, 0);

describe("natureza, período e navegação", () => {
  it("natureza = categoria do assunto + ano do PCA (OUTROS sem categoria)", () => {
    assert.equal(naturezaDoProtocolo("Inclusão de itens no PCA", 2027).rotulo, "INCLUSÃO 2027");
    assert.equal(naturezaDoProtocolo("EXCLUSÃO DE DFD", 2026).rotulo, "EXCLUSÃO 2026");
    assert.equal(naturezaDoProtocolo("ALTERAÇÃO NÃO ONEROSA", null).rotulo, "ALTERAÇÃO NÃO ONEROSA");
    assert.equal(naturezaDoProtocolo("COMUNICAÇÃO INTERNA", 2026).rotulo, "OUTROS 2026");
    assert.equal(naturezaDoProtocolo(null, null).rotulo, "OUTROS");
    const ops = opcoesNatureza([
      { assunto: "COMUNICAÇÃO", anoPca: 2026 },
      { assunto: "EXCLUSÃO", anoPca: 2026 },
      { assunto: "INCLUSÃO", anoPca: 2026 },
      { assunto: "INCLUSÃO", anoPca: 2027 },
      { assunto: "INCLUSÃO", anoPca: 2027 },
    ]);
    assert.deepEqual(ops, ["INCLUSÃO 2027", "INCLUSÃO 2026", "EXCLUSÃO 2026", "OUTROS 2026"]);
  });

  it("janelas pelo dia de Brasília (a madrugada UTC é o dia anterior)", () => {
    const [p] = recorteMetricas([P("2026-09-28 02:00:00")], [], null, F(), HOJE).base;
    const rec = recorteMetricas([p], [], null, F(), HOJE);
    assert.equal(rec.dia.get(p.id), "2026-09-27");
    assert.equal(noPeriodo("2026-09-27", "dia", HOJE), false);
    assert.equal(noPeriodo("2026-09-27", "mes", HOJE), true);
    assert.equal(noPeriodo("2025-09-27", "ano", HOJE), false);
    assert.equal(noPeriodo(null, "tudo", HOJE), true);
    assert.equal(noPeriodo(null, "ano", HOJE), false);
  });

  it("navegar preso ao fim do mês e rótulos", () => {
    assert.equal(navegarRef("2026-01-31", "mes", 1), "2026-02-28");
    assert.equal(navegarRef("2024-01-31", "mes", 1), "2024-02-29");
    assert.equal(navegarRef("2026-12-15", "mes", 1), "2027-01-15");
    assert.equal(navegarRef("2026-01-15", "mes", -1), "2025-12-15");
    assert.equal(navegarRef("2024-02-29", "ano", 1), "2025-02-28");
    assert.equal(navegarRef("2026-09-30", "dia", 1), "2026-10-01");
    assert.equal(navegarRef("2026-09-30", "tudo", 1), "2026-09-30");
    assert.equal(rotuloPeriodo("mes", HOJE, HOJE), "Setembro de 2026");
    assert.equal(rotuloPeriodo("dia", HOJE, HOJE), "Hoje, 28/09/2026");
    assert.equal(rotuloPeriodo("dia", "2026-09-27", HOJE), "27/09/2026");
    assert.equal(rotuloPeriodo("ano", HOJE, HOJE), "2026");
    assert.equal(rotuloPeriodo("tudo", HOJE, HOJE), "Tudo na Mesa");
    assert.deepEqual(
      colunasMetricas(HOJE, HOJE).map((c) => c.rotulo),
      ["Hoje", "set/26", "2026", "Na Mesa"],
    );
    assert.equal(colunasMetricas("2026-09-27", HOJE)[0].rotulo, "27/09");
  });

  it("padrão e recorte filtrado", () => {
    assert.deepEqual(filtroMetricasPadrao(HOJE), { periodo: "tudo", ref: HOJE, medida: "protocolos", pessoa: "responsavel", natureza: null, tipo: null });
    assert.equal(recorteFiltrado(F()), false);
    assert.equal(recorteFiltrado(F({ tipo: "DFD-R" })), true);
    const a: Atividade = { protocoloId: 1, usuarioId: 2, dia: HOJE, tipo: "reenvio", n: 3 };
    assert.deepEqual(atividadeDaTupla(tuplaDaAtividade(a)), a);
  });
});

describe("tabelas por período (a planilha)", () => {
  // NATY = 1, CRIS = 2. Hoje (28/09) às 13h de Brasília = 16h UTC.
  const hoje1 = P("2026-09-28 16:00:00", { responsavelId: 1, distribuidorId: 2 });
  const set1 = P("2026-09-10 12:00:00", { responsavelId: 1, distribuidorId: 2, assunto: "EXCLUSÃO", anoPca: 2026 });
  const set2 = P("2026-09-11 12:00:00", { responsavelId: 2, distribuidorId: 2 });
  const jan2 = P("2026-01-20 12:00:00", { responsavelId: 2, distribuidorId: 1, anoPca: 2026 });
  const antigo = P("2025-11-03 12:00:00", { responsavelId: null, distribuidorId: 1, estado: "erro" });
  const semData = P(null, { responsavelId: 1 });
  const protos = [hoje1, set1, set2, jan2, antigo, semData];
  const dfds = [
    D(hoje1.id, "DFD-S — Solução", 3, 300),
    D(hoje1.id, "DFD-R · Renovação", 2, 200),
    D(set1.id, "DFD-R", 1, 50),
    D(set2.id, null, 4, 40),
    D(jan2.id, "DFD-O", 5, 500),
    D(antigo.id, "DFD-S", 1, 10),
    D(null, "DFD-S", 9, 999), // avulso: fora das métricas de distribuição
  ];

  it("pessoa × Dia | Mês | Ano | Na Mesa, TOTAL = soma e 'sem' por último", () => {
    const rec = recorteMetricas(protos, dfds, null, F({ periodo: "mes" }), HOJE);
    const t = tabelaMetricas(rec, "pessoa");
    const por = Object.fromEntries(t.linhas.map((l) => [l.chave, l.valores]));
    assert.deepEqual(por["1"], { dia: 1, mes: 2, ano: 2, tudo: 3 });
    assert.deepEqual(por["2"], { dia: 0, mes: 1, ano: 2, tudo: 2 });
    assert.deepEqual(por.sem, { dia: 0, mes: 0, ano: 0, tudo: 1 });
    assert.equal(t.linhas.at(-1)?.chave, "sem");
    for (const c of COLUNAS_METRICAS)
      assert.equal(
        t.total[c],
        t.linhas.reduce((s, l) => s + l.valores[c], 0),
      );
    assert.equal(t.correcoes, null); // histórico ainda não chegou
  });

  it("dimensão Distribuição troca a pessoa", () => {
    const rec = recorteMetricas(protos, dfds, null, F({ pessoa: "distribuicao" }), HOJE);
    const por = Object.fromEntries(tabelaMetricas(rec, "pessoa").linhas.map((l) => [l.chave, l.valores.tudo]));
    assert.deepEqual(por, { "1": 2, "2": 3, sem: 1 });
  });

  it("medidas DFDs/itens/valor pelos DFDs da Mesa; o avulso fica fora", () => {
    const itens = tabelaMetricas(recorteMetricas(protos, dfds, null, F({ medida: "itens" }), HOJE), "pessoa");
    assert.equal(itens.total.tudo, 3 + 2 + 1 + 4 + 5 + 1);
    const valor = tabelaMetricas(recorteMetricas(protos, dfds, null, F({ medida: "valor" }), HOJE), "natureza");
    assert.equal(valor.total.tudo, 300 + 200 + 50 + 40 + 500 + 10);
    assert.deepEqual(
      valor.linhas.map((l) => l.rotulo),
      ["INCLUSÃO 2027", "INCLUSÃO 2026", "EXCLUSÃO 2026"],
    );
  });

  it("tipo de DFD: o protocolo com S e R conta nos dois; TOTAL = protocolos distintos; Sem DFDs", () => {
    const rec = recorteMetricas(protos, dfds, null, F(), HOJE);
    const t = tabelaMetricas(rec, "tipo");
    const por = Object.fromEntries(t.linhas.map((l) => [l.chave, l.valores.tudo]));
    assert.deepEqual(por, { "DFD-S": 2, "DFD-R": 2, "DFD-O": 1, sem: 1, "sem-dfds": 1 });
    assert.equal(t.total.tudo, protos.length);
    assert.deepEqual(
      t.linhas.map((l) => l.chave),
      ["DFD-S", "DFD-R", "DFD-O", "sem", "sem-dfds"],
    );
    // Com a medida DFDs: TOTAL = Σ das linhas (partição) e "Sem DFDs" some.
    const dfdsT = tabelaMetricas(recorteMetricas(protos, dfds, null, F({ medida: "dfds" }), HOJE), "tipo");
    assert.equal(dfdsT.total.tudo, 6);
    assert.ok(!dfdsT.linhas.some((l) => l.chave === "sem-dfds"));
  });

  it("filtro de tipo e de natureza recortam a base", () => {
    const soR = recorteMetricas(protos, dfds, null, F({ tipo: "DFD-R", medida: "valor" }), HOJE);
    assert.deepEqual(
      soR.base.map((p) => p.id),
      [hoje1.id, set1.id],
    );
    assert.equal(tabelaMetricas(soR, "pessoa").total.tudo, 200 + 50); // só os DFDs do tipo
    const exc = recorteMetricas(protos, dfds, null, F({ natureza: "EXCLUSÃO 2026" }), HOJE);
    assert.deepEqual(
      exc.base.map((p) => p.id),
      [set1.id],
    );
  });

  it("toda célula tem a sua origem: a soma = o número", () => {
    for (const medida of ["protocolos", "dfds", "itens", "valor"] as const)
      for (const ag of ["pessoa", "natureza", "tipo"] as const) {
        const rec = recorteMetricas(protos, dfds, null, F({ medida, periodo: "ano" }), HOJE);
        const t = tabelaMetricas(rec, ag);
        for (const c of COLUNAS_METRICAS) {
          for (const l of t.linhas) assert.equal(soma(origemDaCelula(rec, ag, l.chave, c)), l.valores[c], `${medida}/${ag}/${l.chave}/${c}`);
          assert.equal(soma(origemDaCelula(rec, ag, null, c)), t.total[c], `${medida}/${ag}/total/${c}`);
        }
      }
  });

  it("correções = reenvios pela data do reenvio (só dos protocolos da base)", () => {
    const at: Atividade[] = [
      { protocoloId: set1.id, usuarioId: 1, dia: HOJE, tipo: "reenvio", n: 1 },
      { protocoloId: jan2.id, usuarioId: 2, dia: "2026-03-02", tipo: "reenvio", n: 2 },
      { protocoloId: jan2.id, usuarioId: 2, dia: HOJE, tipo: "acao", n: 7 },
    ];
    const rec = recorteMetricas(protos, dfds, at, F(), HOJE);
    assert.deepEqual(correcoesPorColuna(rec), { dia: 1, mes: 1, ano: 3, tudo: 3 });
    assert.equal(soma(origemCorrecoes(rec, "ano")), 3);
    // Medida valor: cada reenvio conta o processo de novo.
    const recV = recorteMetricas(protos, dfds, at, F({ medida: "valor" }), HOJE);
    assert.equal(correcoesPorColuna(recV)?.tudo, 50 + 2 * 500);
    assert.equal(soma(origemCorrecoes(recV, "tudo")), 50 + 2 * 500);
    // Filtro de natureza: o reenvio de outra natureza sai.
    const exc = recorteMetricas(protos, dfds, at, F({ natureza: "EXCLUSÃO 2026" }), HOJE);
    assert.deepEqual(correcoesPorColuna(exc), { dia: 1, mes: 1, ano: 1, tudo: 1 });
  });
});

describe("evolução", () => {
  it("baldes: 12 semanas (seg–dom), meses, dias do mês e a semana do dia", () => {
    const sem = baldesEvolucao("tudo", HOJE, HOJE);
    assert.equal(sem.length, 12);
    assert.equal(sem.at(-1)?.de, "2026-09-28");
    assert.equal(sem.at(-1)?.ate, "2026-10-04");
    assert.ok(sem.at(-1)?.atual);
    assert.equal(baldesEvolucao("ano", HOJE, HOJE).length, 12);
    assert.equal(baldesEvolucao("ano", HOJE, HOJE)[8].rotulo, "set");
    assert.equal(baldesEvolucao("mes", HOJE, HOJE).length, 30);
    const semana = baldesEvolucao("dia", "2026-10-01", HOJE);
    assert.deepEqual(
      [semana[0].de, semana[6].de],
      ["2026-09-28", "2026-10-04"],
    );
    assert.ok(semana.find((b) => b.de === "2026-10-01")?.atual);
  });

  it("a soma dos baldes do ano = a coluna Ano; a origem de cada balde = o balde", () => {
    const protos = [P("2026-02-10 15:00:00"), P("2026-02-11 15:00:00"), P("2026-09-28 15:00:00"), P("2025-12-31 15:00:00")];
    const dfds = protos.map((p) => D(p.id, "DFD-S", 2, 100));
    const rec = recorteMetricas(protos, dfds, null, F({ periodo: "ano", medida: "itens" }), HOJE);
    const b = baldesEvolucao("ano", HOJE, HOJE);
    const v = evolucaoMetricas(rec, b);
    assert.equal(
      v.reduce((s, x) => s + x, 0),
      tabelaMetricas(rec, "pessoa").total.ano,
    );
    assert.equal(v[1], 4);
    b.forEach((balde, i) => {
      assert.equal(soma(origemDoBalde(rec, balde)), v[i]);
    });
  });
});

describe("desempenho por pessoa (governança)", () => {
  const a = P("2026-09-01 15:00:00", { responsavelId: 1, distribuidorId: 3, estado: "regular", dfdsErro: 0 });
  const b = P("2026-09-02 15:00:00", { responsavelId: 1, distribuidorId: 3, estado: "erro", dfdsErro: 2, dfdsAtencao: 1 });
  const c = P("2026-07-01 15:00:00", { responsavelId: 2, distribuidorId: 3, estado: "conferindo" });
  const d = P("2026-09-20 15:00:00", { responsavelId: null, estado: "atencao" });
  const protos = [a, b, c, d];
  const dfds = [D(a.id, "DFD-S", 2, 10), D(b.id, "DFD-R", 3, 20), D(c.id, "DFD-S", 1, 5)];
  const at: Atividade[] = [
    { protocoloId: b.id, usuarioId: 2, dia: "2026-09-15", tipo: "reenvio", n: 1 },
    { protocoloId: c.id, usuarioId: 2, dia: "2026-07-03", tipo: "reenvio", n: 1 },
    { protocoloId: a.id, usuarioId: 2, dia: "2026-09-20", tipo: "acao", n: 4 },
    { protocoloId: b.id, usuarioId: 9, dia: "2026-09-21", tipo: "acao", n: 2 },
    { protocoloId: b.id, usuarioId: null, dia: "2026-09-21", tipo: "acao", n: 5 }, // ator removido: não conta
  ];

  it("coorte do mês, estados, DFDs com erro, tempo e o alerta de 30 dias", () => {
    const rec = recorteMetricas(protos, dfds, at, F({ periodo: "mes" }), HOJE);
    const l = Object.fromEntries(desempenhoPorPessoa(rec).map((x) => [x.chave, x]));
    assert.equal(l["1"].protocolos, 2);
    assert.equal(l["1"].itens, 5);
    assert.equal(l["1"].conferidos, 2);
    assert.equal(l["1"].regulares, 1);
    assert.equal(l["1"].erro, 1);
    assert.equal(l["1"].dfdsErro, 2);
    assert.equal(l["1"].dfdsAtencao, 1);
    assert.equal(l["1"].diasMedio, (27 + 26) / 2);
    assert.equal(l["1"].acimaAlerta, 0);
    assert.equal(l["1"].correcoes, 1); // o reenvio de set/15 do protocolo dela
    assert.equal(l["2"].protocolos, 0); // o de julho está fora da coorte de setembro
    assert.equal(l["2"].acoes, 4); // as ações são de quem as fez
    assert.equal(l["2"].correcoes, 0); // o reenvio dela foi em julho
    assert.equal(l["9"].acoes, 2);
    assert.equal(l.sem.protocolos, 1);
    assert.equal(l.sem.conferidos, 1);
    assert.equal(desempenhoPorPessoa(rec).at(-1)?.chave, "sem");
  });

  it("Tudo: o conferindo não entra na conformidade; o antigo passa do alerta", () => {
    const rec = recorteMetricas(protos, dfds, at, F(), HOJE);
    const l = Object.fromEntries(desempenhoPorPessoa(rec).map((x) => [x.chave, x]));
    assert.equal(l["2"].protocolos, 1);
    assert.equal(l["2"].conferidos, 0);
    assert.equal(l["2"].acimaAlerta, 1);
    assert.equal(l["2"].correcoes, 1);
    assert.equal(
      protocolosDaPessoa(rec, "1").map((o) => o.protocolo.id).join(),
      `${a.id},${b.id}`,
    );
  });

  it("distribuição: a correção vai para quem protocolou; sem histórico = null", () => {
    const rec = recorteMetricas(protos, dfds, at, F({ pessoa: "distribuicao" }), HOJE);
    const l = Object.fromEntries(desempenhoPorPessoa(rec).map((x) => [x.chave, x]));
    assert.equal(l["3"].protocolos, 3);
    assert.equal(l["3"].correcoes, 2);
    const semHist = desempenhoPorPessoa(recorteMetricas(protos, dfds, null, F(), HOJE));
    assert.ok(semHist.every((x) => x.correcoes === null && x.acoes === null));
  });

  it("resumo do recorte e DFDs dos quadros da Mesa", () => {
    const rec = recorteMetricas(protos, [...dfds, D(null, "DFD-S", 1, 1)], at, F({ periodo: "mes" }), HOJE);
    assert.deepEqual(resumoMetricas(rec), { protocolos: 3, dfds: 2, itens: 5, valor: 30, correcoes: 1, corrigidos: 1, acoes: 6 });
    assert.equal(dfdsDoRecorteMetricas([...dfds, D(null, "DFD-S", 1, 1)], rec).length, 2);
    const tudo = recorteMetricas(protos, [...dfds, D(null, "DFD-S", 1, 1)], at, F(), HOJE);
    assert.equal(dfdsDoRecorteMetricas([...dfds, D(null, "DFD-S", 1, 1)], tudo).length, 4); // o Dashboard de sempre
  });

  it("situações por pessoa (a desconhecida = sem situação)", () => {
    const m = situacoesPorPessoa([{ ...a, situacaoId: 7 }, { ...b, situacaoId: 99 }, c], "responsavel", [7]);
    assert.equal(m.get(1)?.get(7), 1);
    assert.equal(m.get(1)?.get(null), 1);
    assert.equal(m.get(2)?.get(null), 1);
  });
});
