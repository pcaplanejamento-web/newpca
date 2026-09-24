import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classificacaoItemSchema, sinonimosUnidadesSchema, unidadeMedidaSchema } from "../src/lib/padronizacao-validation.ts";

describe("unidadeMedidaSchema", () => {
  it("aceita sigla + nome e completa os opcionais", () => {
    const r = unidadeMedidaSchema.safeParse({ sigla: " UN ", nome: "UNIDADE" });
    assert.ok(r.success);
    assert.deepEqual(r.data, { sigla: "UN", nome: "UNIDADE", sinonimos: [], classificacaoId: null });
  });
  it("recusa sigla/nome vazios ou só pontuação, sigla longa e classificação inválida", () => {
    assert.equal(unidadeMedidaSchema.safeParse({ sigla: "", nome: "UNIDADE" }).success, false);
    assert.equal(unidadeMedidaSchema.safeParse({ sigla: "-.", nome: "UNIDADE" }).success, false);
    assert.equal(unidadeMedidaSchema.safeParse({ sigla: "UN", nome: "  " }).success, false);
    assert.equal(unidadeMedidaSchema.safeParse({ sigla: "X".repeat(21), nome: "UNIDADE" }).success, false);
    assert.equal(unidadeMedidaSchema.safeParse({ sigla: "UN", nome: "UNIDADE", classificacaoId: 0 }).success, false);
  });
  it("limita os sinônimos (quantidade e tamanho)", () => {
    assert.equal(unidadeMedidaSchema.safeParse({ sigla: "UN", nome: "UNIDADE", sinonimos: Array.from({ length: 101 }, (_, i) => `U${i}`) }).success, false);
    assert.equal(unidadeMedidaSchema.safeParse({ sigla: "UN", nome: "UNIDADE", sinonimos: ["X".repeat(61)] }).success, false);
  });
});

describe("classificacaoItemSchema", () => {
  it("aceita nome + cor e completa as palavras-chave", () => {
    const r = classificacaoItemSchema.safeParse({ nome: "Serviço", cor: "#2563eb" });
    assert.ok(r.success);
    assert.deepEqual(r.data.palavras, []);
  });
  it("recusa cor fora de #RRGGBB, nome vazio e palavras demais", () => {
    assert.equal(classificacaoItemSchema.safeParse({ nome: "Serviço", cor: "blue" }).success, false);
    assert.equal(classificacaoItemSchema.safeParse({ nome: " ", cor: "#2563eb" }).success, false);
    assert.equal(classificacaoItemSchema.safeParse({ nome: "S", cor: "#2563eb", palavras: Array.from({ length: 301 }, (_, i) => `P${i}`) }).success, false);
  });
});

describe("sinonimosUnidadesSchema", () => {
  it("exige ao menos uma grafia e no máximo 200", () => {
    assert.equal(sinonimosUnidadesSchema.safeParse({ itens: [] }).success, false);
    assert.equal(sinonimosUnidadesSchema.safeParse({ itens: [{ unidadeId: 1, texto: "UND" }] }).success, true);
    assert.equal(sinonimosUnidadesSchema.safeParse({ itens: Array.from({ length: 201 }, () => ({ unidadeId: 1, texto: "UND" })) }).success, false);
    assert.equal(sinonimosUnidadesSchema.safeParse({ itens: [{ unidadeId: 1, texto: "  " }] }).success, false);
  });
});
