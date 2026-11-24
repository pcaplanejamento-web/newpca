import assert from "node:assert/strict";
import test from "node:test";
import { deslocamento, deveFechar, gestoComecou, LIMIAR_GESTO } from "../src/lib/gesto-fechar.ts";

test("gesto de fechar: só começa no eixo certo e depois do limiar", () => {
  assert.equal(gestoComecou(LIMIAR_GESTO, 0), false);
  assert.equal(gestoComecou(20, 2), true);
  assert.equal(gestoComecou(20, 30), false, "rolagem de lado não arrasta o painel");
  assert.equal(gestoComecou(-20, 0), false, "contra a direção de fechar não é gesto");
});

test("gesto de fechar: fecha por distância (30%) ou por peteleco; volta no resto", () => {
  assert.equal(deveFechar(120, 400, 0), true);
  assert.equal(deveFechar(100, 400, 0), false);
  assert.equal(deveFechar(40, 400, 0.8), true, "peteleco rápido fecha");
  assert.equal(deveFechar(10, 400, 2), false, "um tremor não fecha");
  assert.equal(deveFechar(-50, 400, 3), false);
});

test("gesto de fechar: segue o dedo na direção de fechar e resiste na contrária", () => {
  assert.equal(deslocamento(60), 60);
  assert.equal(deslocamento(-60), -10);
});
