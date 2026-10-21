import assert from "node:assert/strict";
import test from "node:test";
import { chaveFonte, compactarFontesAbas, filtroDoEscopo, lerFontesAbas } from "../src/lib/escopo-unidades-core.ts";

test("chaveFonte: sem aba = a 1ª; tela sem aba = null", () => {
  assert.equal(chaveFonte("pca"), "pca.lista");
  assert.equal(chaveFonte("pca", "orcamento"), "pca.orcamento");
  assert.equal(chaveFonte("pca", "x"), "pca.lista");
  assert.equal(chaveFonte("verificacao"), null);
});

test("lerFontesAbas/compactarFontesAbas: só chaves conhecidas das telas do grupo", () => {
  assert.deepEqual(lerFontesAbas('["pca.dashboard","pca.dashboard","x.y",3]'), ["pca.dashboard"]);
  assert.deepEqual(lerFontesAbas("{"), []);
  assert.deepEqual(compactarFontesAbas(["pca.mesa", "dfd.mesa", "x.y"], ["pca"]), ["pca.mesa"]);
});

test("filtroDoEscopo: a soma das unidades", () => {
  assert.deepEqual(filtroDoEscopo({ tipo: "unidades", ids: [1, 2] }), { tipo: "unidades", ids: [1, 2] });
  assert.equal(filtroDoEscopo({ tipo: "unidades", ids: [3] }).tipo, "unidade");
});
