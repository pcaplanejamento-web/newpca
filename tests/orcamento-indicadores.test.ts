import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dotacaoAtualizada, empenhoLiquido, pctEmpenhado } from "../src/lib/orcamento-indicadores.ts";

describe("orcamento-indicadores", () => {
  it("dotação atualizada = inicial + suplementação − redução (a anulação é do empenho)", () => {
    assert.equal(dotacaoAtualizada({ valorInicial: 1000, suplementacao: 200, reducao: 50, anulacao: 30, empenho: 0 }), 1150);
  });
  it("% empenhado sobre a dotação atualizada, limitado a 0..100; sem dotação = 0", () => {
    assert.equal(pctEmpenhado({ valorInicial: 1000, suplementacao: 0, anulacao: 0, empenho: 250 }), 25);
    assert.equal(pctEmpenhado({ valorInicial: 100, suplementacao: 0, anulacao: 0, empenho: 500 }), 100);
    assert.equal(pctEmpenhado({ valorInicial: 0, suplementacao: 0, anulacao: 0, empenho: 10 }), 0);
  });
});

it("dotação atualizada desconta a REDUÇÃO; o empenhado é líquido da anulação", () => {
  const t = { valorInicial: 550000, suplementacao: 0, reducao: 131486.9, anulacao: 0, empenho: 418513.1 };
  assert.ok(Math.abs(dotacaoAtualizada(t) - 418513.1) < 1e-6);
  assert.equal(pctEmpenhado(t), 100);
  assert.equal(empenhoLiquido({ valorInicial: 0, suplementacao: 0, anulacao: 30, empenho: 100 }), 70);
});
