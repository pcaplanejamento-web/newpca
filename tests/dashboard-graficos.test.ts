import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layoutPng, MAX_LINHAS_PNG } from "../src/lib/exportar-grafico.ts";
import { agregarItensDash, alternarFiltro, type ItemAgregavel, type FiltrosDash, filtrarItensDash, mesmoRecorte, temFiltro } from "../src/lib/origem-dash.ts";
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
    // O mês 3 traz o anual (id 3) — sem o filtro de classificação, ele aparece no gráfico de classificação.
    assert.deepEqual(filtrarItensDash(I, f, "classificacao").map((i) => i.id), [1, 3, 4]);
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
