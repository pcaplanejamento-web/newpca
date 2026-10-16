import assert from "node:assert/strict";
import { test } from "node:test";
import { CONFIG_ESCOPO_PADRAO, diffConfigEscopo, filtroDoModulo, lancamentoNaUnidade, lerConfigEscopo, tarefaNaUnidade } from "../src/lib/escopo-cabecalho-core.ts";

test("lerConfigEscopo: qualquer JSON vira a config válida", () => {
  assert.deepEqual(lerConfigEscopo(null), CONFIG_ESCOPO_PADRAO);
  const c = lerConfigEscopo({ modulos: { pca: false, x: true }, catalogo: "todos", orcamentoSemVinculo: "sim" });
  assert.equal(c.modulos.pca, false);
  assert.equal(c.modulos.orcamento, true);
  assert.equal(c.catalogo, "todos");
  assert.equal(c.orcamentoSemVinculo, false);
  assert.deepEqual(diffConfigEscopo(CONFIG_ESCOPO_PADRAO, c), ["PCA não obedece", "catálogo: inteiro"]);
});

test("filtroDoModulo: desligado = sem filtro; ligado = a unidade (ou nenhuma)", () => {
  const c = lerConfigEscopo({ modulos: { pca: false } });
  assert.equal(filtroDoModulo(c, "pca", 5), null);
  assert.equal(filtroDoModulo(c, "orcamento", 5), 5);
  assert.equal(filtroDoModulo(c, "orcamento", false), false);
  assert.equal(filtroDoModulo(c, "orcamento", null), null);
});

test("tarefa e lançamento na unidade", () => {
  assert.equal(tarefaNaUnidade([], 3, true), true);
  assert.equal(tarefaNaUnidade([], 3, false), false);
  assert.equal(tarefaNaUnidade([1, 3], 3, false), true);
  assert.equal(tarefaNaUnidade([1], 3, true), false);
  assert.equal(lancamentoNaUnidade(3, 3, false), true);
  assert.equal(lancamentoNaUnidade(4, 3, true), false);
  assert.equal(lancamentoNaUnidade(null, 3, true), true);
  assert.equal(lancamentoNaUnidade(undefined, 3, false), false);
});
