import assert from "node:assert/strict";
import { test } from "node:test";
import { linhasDoTexto, linhasParaTexto } from "../src/lib/itens-dash-texto.ts";

test("texto compacto genérico: ida e volta com nulos, aspas e acentos", () => {
  const linhas = [
    { id: 1, produto: 'CANETA "AZUL"', quantidade: 10, subunidade: null, canceladoEm: undefined },
    { id: 2, produto: "ÁGUA MINERAL", quantidade: null, subunidade: "Almoxarifado", canceladoEm: "2026-11-06" },
  ];
  const t = linhasParaTexto(linhas, ["id", "produto", "quantidade", "subunidade", "canceladoEm"]);
  const volta = linhasDoTexto<(typeof linhas)[number]>(t);
  assert.deepEqual(volta, [
    { id: 1, produto: 'CANETA "AZUL"', quantidade: 10, subunidade: null, canceladoEm: null },
    { id: 2, produto: "ÁGUA MINERAL", quantidade: null, subunidade: "Almoxarifado", canceladoEm: "2026-11-06" },
  ]);
  // As chaves vão UMA vez: 20 mil linhas não repetem os nomes dos campos.
  const muitas = Array.from({ length: 20000 }, (_, i) => ({ id: i, produto: "X", quantidade: 1, subunidade: null, canceladoEm: null }));
  const tm = linhasParaTexto(muitas, ["id", "produto", "quantidade", "subunidade", "canceladoEm"]);
  assert.ok(tm.length < JSON.stringify(muitas).length / 2);
  assert.equal(linhasDoTexto(tm).length, 20000);
});
