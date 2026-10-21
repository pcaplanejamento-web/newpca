import assert from "node:assert/strict";
import { test } from "node:test";
import { comFuncoesDoGrupo, compactarFuncoesOff, lerFuncoesOff, retirado } from "../src/lib/papeis-componentes-core.ts";

test("lerFuncoesOff: só chaves do catálogo, sem repetir; lixo = nenhuma", () => {
  assert.deepEqual(lerFuncoesOff('["pca.dashboard","pca.dashboard","x.y",3]'), ["pca.dashboard"]);
  assert.deepEqual(lerFuncoesOff("{quebrado"), []);
  assert.deepEqual(lerFuncoesOff(null), []);
});

test("compactarFuncoesOff: só as telas do grupo, na ordem do catálogo", () => {
  assert.deepEqual(compactarFuncoesOff(["pca.variacao", "dfd.dashboard", "pca.dashboard"], ["pca"]), ["pca.dashboard", "pca.variacao"]);
});

test("comFuncoesDoGrupo: a função desligada some inteira (todas as ações); o papel continua valendo", () => {
  const r = comFuncoesDoGrupo({ "catalogo.lista": ["exportar"] }, ["pca.dashboard"]);
  assert.ok(retirado(r, "pca.dashboard", "visualizar"));
  assert.ok(retirado(r, "pca.dashboard", "exportar"));
  assert.ok(retirado(r, "catalogo.lista", "exportar"));
  assert.ok(!retirado(r, "pca.mesa", "visualizar"));
  assert.ok(!retirado(r, "pca.dashboard", "visualizar", true), "o Administrador ignora");
  assert.deepEqual(comFuncoesDoGrupo({}, []), {});
});
