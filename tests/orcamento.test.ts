import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orcamentoItemImportSchema, orcamentoOpSchema, patchOrcamentoSchema } from "../src/lib/orcamento-validation.ts";

// Uma linha COMPLETA do CUBO (todos os textos obrigatórios).
const L = { orgao: "A", unidade: "1 - U", funcao: "08", programa: "61", acao: "2191", nomeElemento: "X", codigoElemento: "3.3.90.30.00", ficha: "0624", fonte: "100" };

describe("orcamento-validation", () => {
  it("orcamentoItemImportSchema: a linha completa passa (valores 0, seq null por padrão)", () => {
    const r = orcamentoItemImportSchema.parse({ ...L, valorInicial: 100 });
    assert.equal(r.unidade, "1 - U");
    assert.equal(r.valorInicial, 100);
    assert.equal(r.valorEmpenho, 0);
    assert.equal(r.saldo, 0);
    assert.equal(r.sequencial, null);
  });

  it("orcamentoItemImportSchema: recusa texto obrigatório vazio, ficha/código fora do padrão e valor não finito", () => {
    for (const k of Object.keys(L)) assert.equal(orcamentoItemImportSchema.safeParse({ ...L, [k]: " " }).success, false, k);
    assert.equal(orcamentoItemImportSchema.safeParse({ ...L, ficha: "06A4" }).success, false);
    assert.equal(orcamentoItemImportSchema.safeParse({ ...L, codigoElemento: "ABC" }).success, false);
    assert.equal(orcamentoItemImportSchema.safeParse({ ...L, valorInicial: Number.NaN }).success, false);
  });

  it("start-orcamento: exige ano 2000–2100 e ≥1 linha", () => {
    const base = {
      mode: "start-orcamento" as const,
      nome: "Orçamento",
      ano: 2026,
      totalItens: 1,
      rows: [{ ...L, valorInicial: 10 }],
    };
    assert.ok(orcamentoOpSchema.safeParse(base).success);
    assert.ok(!orcamentoOpSchema.safeParse({ ...base, ano: 1999 }).success);
    assert.ok(!orcamentoOpSchema.safeParse({ ...base, ano: 2200 }).success);
    assert.ok(!orcamentoOpSchema.safeParse({ ...base, rows: [] }).success);
    assert.ok(!orcamentoOpSchema.safeParse({ ...base, nome: "" }).success);
  });

  it("append-orcamento-itens: exige orcamentoId + desde", () => {
    assert.ok(
      orcamentoOpSchema.safeParse({ mode: "append-orcamento-itens", orcamentoId: 3, desde: 200, rows: [L] }).success,
    );
    assert.ok(!orcamentoOpSchema.safeParse({ mode: "append-orcamento-itens", desde: 0, rows: [{ orgao: "A" }] }).success);
  });

  it("patchOrcamentoSchema: ≥1 campo; ano no intervalo", () => {
    assert.ok(patchOrcamentoSchema.safeParse({ nome: "Novo" }).success);
    assert.ok(patchOrcamentoSchema.safeParse({ ano: 2027 }).success);
    assert.ok(!patchOrcamentoSchema.safeParse({}).success);
    assert.ok(!patchOrcamentoSchema.safeParse({ ano: 1000 }).success);
  });
});
