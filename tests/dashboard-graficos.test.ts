import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layoutPng, MAX_LINHAS_PNG } from "../src/lib/exportar-grafico.ts";
import { blocosRelatorioDashboard } from "../src/lib/dashboard-relatorio.ts";
import {
  agregarItensDash,
  alternarFiltro,
  cronogramaDash,
  definicaoDash,
  fatiasDash,
  periodicosDash,
  previsaoDoItem,
  itensDoRecorte,
  type ItemAgregavel, type FiltrosDash, chavesDoFiltro, filtrarItensDash, mesesDoRecorte, mesmoRecorte, opcoesDash, recorteDasChaves, rotuloVarios, temFiltro } from "../src/lib/origem-dash.ts";
import { agregarDashboard } from "../src/lib/pca-core.ts";
import { fatiasPequenas, rankingSerie, textoParticipacao } from "../src/lib/ranking-grafico.ts";

const base = { idProduto: null, sequencial: null, quantidade: 1, valorReferencia: null };
const I: (ItemAgregavel & { ano: number })[] = [
  { ...base, id: 1, nomeProduto: "A", classificacao: "Serviço", unidadeMedida: "UN", ano: 2026, mes: 3, valorTotal: 100, codigo: "SMS" },
  { ...base, id: 2, nomeProduto: "B", classificacao: "Material", unidadeMedida: null, ano: 2026, mes: 4, valorTotal: 50, codigo: "SME" },
  { ...base, id: 3, nomeProduto: "C", classificacao: null, unidadeMedida: "KG", ano: 2026, mes: null, anual: true, valorTotal: 1200, codigo: "SMS" },
  { ...base, id: 4, nomeProduto: "D", classificacao: "Serviço", unidadeMedida: "UN", ano: 2026, mes: 3, valorTotal: 10, codigo: null },
];

describe("filtro cruzado do Dashboard", () => {
  it("alternar: o mesmo recorte tira; outro valor da dimensão troca; outra dimensão soma", () => {
    let f: FiltrosDash = {};
    f = alternarFiltro(f, { dim: "classificacao", labels: ["Serviço"] }, "Serviço");
    assert.equal(temFiltro(f), true);
    f = alternarFiltro(f, { dim: "mes", ano: 2026, mes: 3 }, "mar/26");
    assert.deepEqual(Object.keys(f).sort(), ["classificacao", "mes"]);
    f = alternarFiltro(f, { dim: "classificacao", labels: ["Material"] }, "Material");
    assert.ok(mesmoRecorte(f.classificacao?.recorte, { dim: "classificacao", labels: ["Material"] }));
    f = alternarFiltro(f, { dim: "classificacao", labels: ["Material"] }, "Material");
    assert.equal(f.classificacao, undefined);
    f = alternarFiltro(f, { dim: "mes", ano: 2026, mes: 3 }, "mar/26");
    assert.equal(temFiltro(f), false);
  });
  it("E entre as dimensões; o gráfico se desenha SEM o filtro da própria dimensão", () => {
    const f: FiltrosDash = {
      classificacao: { recorte: { dim: "classificacao", labels: ["Serviço"] }, rotulo: "Serviço" },
      mes: { recorte: { dim: "mes", ano: 2026, mes: 3 }, rotulo: "mar/26" },
    };
    assert.deepEqual(filtrarItensDash(I, f).map((i) => i.id), [1, 4]);
    // O mês 3 = só os itens com o mês definido (o genérico id 3 fica fora — tem a dimensão Previsão).
    assert.deepEqual(filtrarItensDash(I, f, "classificacao").map((i) => i.id), [1, 4]);
    assert.deepEqual(filtrarItensDash(I, {}).length, I.length);
  });
  it("sem filtro, a agregação no navegador = a do servidor (agregarDashboard)", () => {
    const a = agregarItensDash(I);
    const b = agregarDashboard(
      I.map((i) => ({
        id: i.id,
        codigoProduto: null,
        sequencial: null,
        nome: i.nomeProduto,
        unidadeMedida: i.unidadeMedida,
        quantidade: 1,
        valorUnitario: null,
        valorTotal: i.valorTotal ?? 0,
        classificacao: i.classificacao ?? "",
        previsao: i.anual ? { ano: i.ano, anual: true as const } : i.mes != null ? { ano: i.ano, mes: i.mes } : null,
        unidade: i.codigo,
        origem: null,
      })),
    );
    assert.deepEqual(a, b);
    assert.equal(a.resumo.total, 1360);
    assert.equal(a.resumo.numUnidades, 2);
    assert.deepEqual(
      a.porClassificacao.map((f) => f.label),
      ["—", "Serviço", "Material"],
    );
  });
});

describe("ranking do explorador", () => {
  it("ordem, participação, posição (empate divide) e pequenas", () => {
    const r = rankingSerie([
      { chave: "a", rotulo: "A", valor: 10 },
      { chave: "b", rotulo: "B", valor: 970 },
      { chave: "c", rotulo: "C", valor: 10 },
      { chave: "d", rotulo: "D", valor: 10 },
    ]);
    assert.deepEqual(
      r.map((p) => [p.chave, p.posicao]),
      [
        ["b", 1],
        ["a", 2],
        ["c", 2],
        ["d", 2],
      ],
    );
    assert.equal(r[0].participacao, 0.97);
    assert.equal(fatiasPequenas(r), 3);
    assert.equal(textoParticipacao(0.97), "97%");
    assert.equal(textoParticipacao(0.0004), "< 0,1%");
    assert.equal(textoParticipacao(0), "0%");
    assert.equal(rankingSerie([{ chave: "x", rotulo: "X", valor: 0 }])[0].participacao, 0);
  });
});

describe("PNG do gráfico (layout)", () => {
  it("escala pela maior, corta no teto e conta o resto", () => {
    const linhas = Array.from({ length: MAX_LINHAS_PNG + 5 }, (_, i) => ({
      rotulo: `L${i}`,
      valor: MAX_LINHAS_PNG + 5 - i,
      texto: String(i),
      participacao: "",
      cor: "#000",
    }));
    const l = layoutPng({ titulo: "T", linhas });
    assert.equal(l.barras.length, MAX_LINHAS_PNG);
    assert.equal(l.mais, 5);
    const maior = Math.max(...l.barras.map((b) => b.largura));
    assert.equal(l.barras[0].largura, maior);
    assert.ok(l.barras[1].largura < maior);
    assert.ok(l.altura > (l.barras.at(-1)?.y ?? 0));
    assert.equal(layoutPng({ titulo: "T", linhas: [{ rotulo: "z", valor: 0, texto: "", participacao: "", cor: "#000" }] }).barras[0].largura, 0);
  });
});

describe("novos gráficos (prioridade, unidade, cronograma)", () => {
  const J: (ItemAgregavel & { ano: number })[] = [
    { ...base, id: 1, nomeProduto: "A", classificacao: "S", unidadeMedida: "UN", ano: 2026, mes: 3, valorTotal: 100, codigo: "SMS", prioridade: "ALTA" },
    { ...base, id: 2, nomeProduto: "B", classificacao: "S", unidadeMedida: "UN", ano: 2026, mes: 4, valorTotal: 50, codigo: "SME", prioridade: null },
    { ...base, id: 3, nomeProduto: "C", classificacao: "S", unidadeMedida: "UN", ano: 2026, mes: null, anual: true, valorTotal: 1200, codigo: "SMS", prioridade: "BAIXA" },
  ];
  it("fatias por prioridade/unidade (vazio = —) e o recorte", () => {
    assert.deepEqual(
      fatiasDash(J, "prioridade").map((f) => [f.label, f.total]),
      [
        ["BAIXA", 1200],
        ["ALTA", 100],
        ["—", 50],
      ],
    );
    assert.deepEqual(
      fatiasDash(J, "unidade").map((f) => [f.label, f.count]),
      [
        ["SMS", 2],
        ["SME", 1],
      ],
    );
    assert.deepEqual(itensDoRecorte(J, { dim: "prioridade", labels: ["—"] }).itens.map((i) => i.id), [2]);
    assert.deepEqual(itensDoRecorte(J, { dim: "unidade", labels: ["SMS"] }).itens.map((i) => i.id), [1, 3]);
  });
  it("cronograma: só os de MÊS definido; acumulado; distribuído (os genéricos em 1/12) — e o recorte de mês", () => {
    const mensal = cronogramaDash(J, "mensal");
    assert.deepEqual(
      mensal.map((p) => [p.mes, p.total]),
      [
        [3, 100],
        [4, 50],
      ],
    );
    assert.equal(cronogramaDash(J, "acumulado").at(-1)?.total, 150);
    const dist = cronogramaDash(J, "distribuido");
    assert.equal(dist.length, 12);
    assert.equal(dist.find((p) => p.mes === 3)?.total, 200);
    assert.equal(dist.reduce((s, p) => s + p.total, 0), 1350);
    assert.deepEqual(itensDoRecorte(J, { dim: "mes", ano: 2026, mes: 3 }).itens.map((i) => i.id), [1]);
  });
  it("previsão: mês definido × genérico × sem previsão (Σ = o valor) e as periodicidades", () => {
    const K: ItemAgregavel[] = [
      ...J,
      { ...base, id: 5, nomeProduto: "E", classificacao: "S", unidadeMedida: "UN", ano: 2026, mes: null, anual: true, periodo: "SEMESTRAL", valorTotal: 300, codigo: "SMS" },
      { ...base, id: 6, nomeProduto: "F", classificacao: "S", unidadeMedida: "UN", ano: null, mes: null, valorTotal: 7, codigo: "SMS" },
    ];
    assert.deepEqual(K.map(previsaoDoItem), ["Mês definido", "Mês definido", "Anual", "Semestral", "Sem previsão"]);
    const d = definicaoDash(K);
    assert.deepEqual(
      d.map((f) => [f.label, f.total, f.count]),
      [
        ["Mês definido", 150, 2],
        ["Genérico", 1500, 2],
        ["Sem previsão", 7, 1],
      ],
    );
    assert.equal(Math.round(d.reduce((s, f) => s + f.pct, 0)), 100);
    assert.deepEqual(
      periodicosDash(K).map((f) => [f.label, f.total]),
      [
        ["Anual", 1200],
        ["Semestral", 300],
      ],
    );
    assert.deepEqual(itensDoRecorte(K, { dim: "previsao", labels: ["Anual", "Semestral", "Quadrimestral", "Trimestral"] }).itens.map((i) => i.id), [3, 5]);
    assert.deepEqual(opcoesDash(K, {}, "previsao").map((o) => o.chave), ["Mês definido", "Anual", "Semestral", "Sem previsão"]);
  });
  it("relatório do Dashboard: KPIs, filtros e uma tabela por gráfico com % e TOTAL", () => {
    const b = blocosRelatorioDashboard({
      titulo: "Dashboard — PCA 2027",
      filtros: "Prioridade: Alta",
      resumo: { total: 150, count: 2, ticket: 75, maiorNome: "A", maiorValor: 100 },
      graficos: [
        { titulo: "Classificação", rotulo: "Classe", fatias: [{ label: "S", total: 150, count: 2 }] },
        { titulo: "Vazio", rotulo: "X", fatias: [] },
      ],
    });
    assert.equal(b.filter((x) => x.tipo === "tabela").length, 1);
    const t = b.find((x) => x.tipo === "tabela");
    assert.ok(t && t.tipo === "tabela");
    assert.deepEqual(t.linhas.at(-1)?.celulas[0], "TOTAL");
    assert.ok(t.linhas[0].celulas[3].startsWith("100"));
    assert.ok(b.some((x) => x.tipo === "paragrafo" && x.texto.includes("Prioridade: Alta")));
  });
});

describe("filtros do topo (menus)", () => {
  it("opções conectadas: contagem pelos DEMAIS filtros; o mês em ordem (só os de mês definido)", () => {
    assert.deepEqual(opcoesDash(I, {}, "mes"), [
      { chave: "2026-3", count: 2 },
      { chave: "2026-4", count: 1 },
    ]);
    const f: FiltrosDash = { unidade: { recorte: { dim: "unidade", labels: ["SMS"] }, rotulo: "SMS" } };
    assert.deepEqual(opcoesDash(I, f, "classificacao"), [
      { chave: "Serviço", count: 1 },
      { chave: "—", count: 1 },
    ]);
    // a própria dimensão não se filtra: todas as unidades continuam
    assert.equal(opcoesDash(I, f, "unidade").length, 3);
  });

  it("vários valores viram UM recorte; a contagem da opção bate com o filtro", () => {
    const r = recorteDasChaves("mes", ["2026-3", "2026-4"]);
    assert.ok(r);
    assert.deepEqual(mesesDoRecorte(r).sort(), ["2026-3", "2026-4"]);
    const lista = filtrarItensDash(I, { mes: { recorte: r, rotulo: "x" } });
    assert.deepEqual(lista.map((i) => i.id).sort(), [1, 2, 4]);
    const so = recorteDasChaves("mes", ["2026-3"]);
    assert.ok(so);
    assert.equal(filtrarItensDash(I, { mes: { recorte: so, rotulo: "x" } }).length, 2);
    assert.equal(recorteDasChaves("classificacao", []), null);
    const c = recorteDasChaves("classificacao", ["Serviço", "Material"]);
    assert.ok(c);
    assert.deepEqual(chavesDoFiltro({ classificacao: { recorte: c, rotulo: "" } }, "classificacao"), ["Serviço", "Material"]);
  });

  it("o escolhido zerado pelos outros filtros continua na lista (dá para desmarcar)", () => {
    const f: FiltrosDash = {
      classificacao: { recorte: { dim: "classificacao", labels: ["Material"] }, rotulo: "Material" },
      unidade: { recorte: { dim: "unidade", labels: ["SMS"] }, rotulo: "SMS" },
    };
    assert.ok(opcoesDash(I, f, "classificacao").some((o) => o.chave === "Material" && o.count === 0));
  });

  it("texto do chip com vários valores", () => {
    assert.equal(rotuloVarios(["A"]), "A");
    assert.equal(rotuloVarios(["A", "B"]), "A e B");
    assert.equal(rotuloVarios(["A", "B", "C", "D"]), "A, B e mais 2");
  });
});
