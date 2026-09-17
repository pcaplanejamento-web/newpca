import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orcamentoItemImportSchema, orcamentoOpSchema, patchOrcamentoSchema } from "../src/lib/orcamento-validation.ts";

describe("orcamento-validation", () => {
  it("orcamentoItemImportSchema: defaults (textos vazios, valores 0, seq null)", () => {
    const r = orcamentoItemImportSchema.parse({ orgao: "A", nomeElemento: "X", valorInicial: 100 });
    assert.equal(r.unidade, "");
    assert.equal(r.codigoElemento, "");
    assert.equal(r.valorInicial, 100);
    assert.equal(r.valorEmpenho, 0);
    assert.equal(r.saldo, 0);
    assert.equal(r.sequencial, null);
  });

  it("start-orcamento: exige ano 2000–2100 e ≥1 linha", () => {
    const base = {
      mode: "start-orcamento" as const,
      nome: "Orçamento",
      ano: 2026,
      totalItens: 1,
      rows: [{ orgao: "A", nomeElemento: "X", valorInicial: 10 }],
    };
    assert.ok(orcamentoOpSchema.safeParse(base).success);
    assert.ok(!orcamentoOpSchema.safeParse({ ...base, ano: 1999 }).success);
    assert.ok(!orcamentoOpSchema.safeParse({ ...base, ano: 2200 }).success);
    assert.ok(!orcamentoOpSchema.safeParse({ ...base, rows: [] }).success);
    assert.ok(!orcamentoOpSchema.safeParse({ ...base, nome: "" }).success);
  });

  it("append-orcamento-itens: exige orcamentoId + desde", () => {
    assert.ok(
      orcamentoOpSchema.safeParse({ mode: "append-orcamento-itens", orcamentoId: 3, desde: 200, rows: [{ orgao: "A", nomeElemento: "X" }] }).success,
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
