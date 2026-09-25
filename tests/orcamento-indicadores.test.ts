import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dotacaoAtualizada, pctEmpenhado } from "../src/lib/orcamento-indicadores.ts";

describe("orcamento-indicadores", () => {
  it("dotação atualizada = inicial + suplementação − anulação", () => {
    assert.equal(dotacaoAtualizada({ valorInicial: 1000, suplementacao: 200, anulacao: 50, empenho: 0 }), 1150);
  });
  it("% empenhado sobre a dotação atualizada, limitado a 0..100; sem dotação = 0", () => {
    assert.equal(pctEmpenhado({ valorInicial: 1000, suplementacao: 0, anulacao: 0, empenho: 250 }), 25);
    assert.equal(pctEmpenhado({ valorInicial: 100, suplementacao: 0, anulacao: 0, empenho: 500 }), 100);
    assert.equal(pctEmpenhado({ valorInicial: 0, suplementacao: 0, anulacao: 0, empenho: 10 }), 0);
  });
});
