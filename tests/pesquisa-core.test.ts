import assert from "node:assert/strict";
import { test } from "node:test";
import { ehTipoPesquisa, TIPOS_PADRAO, TIPOS_PESQUISA, tituloPesquisa } from "../src/lib/pesquisa-core.ts";

test("pesquisa: tipos únicos, prefixos e atalhos sem repetir", () => {
  const tipos = TIPOS_PESQUISA.map((t) => t.tipo);
  assert.equal(new Set(tipos).size, tipos.length);
  const atalhos = TIPOS_PESQUISA.flatMap((t) => [t.prefixo, t.curto]);
  assert.equal(new Set(atalhos).size, atalhos.length);
  for (const t of TIPOS_PESQUISA) assert.ok(t.prefixo.endsWith(":") && t.curto.endsWith(":"));
  // os atalhos locais da tela (pca, tela, aba) não colidem
  for (const x of ["pca:", "pc:", "tela:", "te:", "aba:", "a:"]) assert.ok(!atalhos.includes(x));
});

test("pesquisa: validação e títulos", () => {
  assert.ok(ehTipoPesquisa("lancamento"));
  assert.ok(!ehTipoPesquisa("pca"));
  assert.ok(!ehTipoPesquisa("x; drop"));
  assert.equal(tituloPesquisa("historico"), "Histórico de compra");
  assert.deepEqual(TIPOS_PADRAO, TIPOS_PESQUISA.map((t) => t.tipo));
});
