import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { itensDoRecorte } from "../src/lib/origem-dash.ts";

const I = [
  { id: 1, classificacao: "Serviço", unidadeMedida: "UN", ano: 2026, mes: 3 },
  { id: 2, classificacao: "Material", unidadeMedida: null, ano: 2026, mes: 4 },
  { id: 3, classificacao: null, unidadeMedida: "KG", ano: 2026, mes: null, anual: true },
  { id: 4, classificacao: "Obra", unidadeMedida: "UN", ano: 2027, mes: 3 },
  { id: 5, classificacao: "Serviço", unidadeMedida: "UN", ano: null, mes: null },
];
const ids = (r: { itens: { id: number }[] }) => r.itens.map((i) => i.id);

describe("origem dos gráficos (itensDoRecorte)", () => {
  it("classificação: a MESMA chave do gráfico (vazio = —) e a fatia Outros com vários rótulos", () => {
    assert.deepEqual(ids(itensDoRecorte(I, { dim: "classificacao", labels: ["Serviço"] })), [1, 5]);
    assert.deepEqual(ids(itensDoRecorte(I, { dim: "classificacao", labels: ["—"] })), [3]);
    assert.deepEqual(ids(itensDoRecorte(I, { dim: "classificacao", labels: ["Material", "Obra"] })), [2, 4]);
  });
  it("unidade de medida: vazio = —", () => {
    assert.deepEqual(ids(itensDoRecorte(I, { dim: "unidadeMedida", labels: ["—"] })), [2]);
    assert.deepEqual(ids(itensDoRecorte(I, { dim: "unidadeMedida", labels: ["UN"] })), [1, 4, 5]);
  });
  it("mês: o ANUAL do mesmo ano entra (1/12 em cada mês) e é contado; outro ano e sem data ficam fora", () => {
    const r = itensDoRecorte(I, { dim: "mes", ano: 2026, mes: 3 });
    assert.deepEqual(ids(r), [1, 3]);
    assert.equal(r.anuais, 1);
    assert.deepEqual(ids(itensDoRecorte(I, { dim: "mes", ano: 2027, mes: 3 })), [4]);
  });
  it("item: só aquele item", () => {
    assert.deepEqual(ids(itensDoRecorte(I, { dim: "item", id: 4 })), [4]);
    assert.deepEqual(ids(itensDoRecorte(I, { dim: "item", id: 99 })), []);
  });
});
