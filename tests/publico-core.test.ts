import assert from "node:assert/strict";
import { test } from "node:test";
import { abaPublicaPedida, diffPublico, lerConfigPublico, podeLerPublico, PUBLICO_PADRAO } from "../src/lib/publico-core.ts";

test("lerConfigPublico: lista fechada, Dashboard sempre, ordem fixa", () => {
  assert.deepEqual(lerConfigPublico(null), PUBLICO_PADRAO);
  assert.deepEqual(lerConfigPublico({ abas: ["configuracao", "mesa", "importacao", "documentos", "orcamento"] }).abas, ["dashboard", "orcamento", "documentos"]);
  assert.deepEqual(lerConfigPublico({ abas: "orcamento" }).abas, ["dashboard"]);
});

test("abaPublicaPedida: fora das publicadas = Dashboard", () => {
  const cfg = lerConfigPublico({ abas: ["orcamento"] });
  assert.equal(abaPublicaPedida(cfg, "orcamento"), "orcamento");
  assert.equal(abaPublicaPedida(cfg, "documentos"), "dashboard");
  assert.equal(abaPublicaPedida(cfg, "configuracao"), "dashboard");
  assert.equal(abaPublicaPedida(cfg, undefined), "dashboard");
});

test("podeLerPublico: PCA publicado + aba ligada", () => {
  const cfg = lerConfigPublico({ abas: ["documentos"] });
  assert.equal(podeLerPublico({ status: "publicado" }, cfg, "documentos", false), true);
  assert.equal(podeLerPublico({ status: "preview" }, cfg, "documentos", false), false);
  assert.equal(podeLerPublico({ status: "preview" }, cfg, "documentos", true), true);
  assert.equal(podeLerPublico({ status: "publicado" }, cfg, "orcamento", false), false);
  assert.equal(podeLerPublico(null, cfg, "dashboard", true), false);
});

test("menu inicial: só 'recolhido' recolhe; qualquer outro valor = aberto", () => {
  assert.equal(lerConfigPublico({ menu: "recolhido" }).menu, "recolhido");
  assert.equal(lerConfigPublico({ menu: "fechado" }).menu, "aberto");
  assert.equal(lerConfigPublico(null).menu, "aberto");
  assert.match(diffPublico(lerConfigPublico({}), lerConfigPublico({ menu: "recolhido" })), /menu: aberto → recolhido/);
});
