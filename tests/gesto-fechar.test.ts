import assert from "node:assert/strict";
import test from "node:test";
import { rotuloCamada } from "../src/lib/camadas-core.ts";
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

import { camadaAoSoltar, deslocamentoCarrossel } from "../src/lib/gesto-fechar.ts";

test("carrossel de camadas: 1:1 entre camadas, resistência nas pontas", () => {
  assert.equal(deslocamentoCarrossel(-80, 0, 3), -80);
  assert.equal(deslocamentoCarrossel(80, 0, 3), 20, "antes da primeira resiste");
  assert.equal(deslocamentoCarrossel(-80, 2, 3), -20, "depois da última resiste");
  assert.equal(deslocamentoCarrossel(80, 2, 3), 80);
});

test("carrossel de camadas: troca de camada por distância (25%) ou peteleco, nunca além das pontas", () => {
  assert.equal(camadaAoSoltar(0, 3, -100, 390, 0), 1);
  assert.equal(camadaAoSoltar(1, 3, 100, 390, 0), 0);
  assert.equal(camadaAoSoltar(1, 3, -60, 390, 0), 1, "pouco e devagar fica");
  assert.equal(camadaAoSoltar(1, 3, -40, 390, -0.9), 2, "peteleco troca");
  assert.equal(camadaAoSoltar(2, 3, -200, 390, 0), 2, "não passa da última");
  assert.equal(camadaAoSoltar(0, 3, 200, 390, 0), 0, "não volta antes da primeira");
});

test("rótulo da camada: tipo + identificador curto, sem o resto do título", () => {
  assert.deepEqual(rotuloCamada("Protocolo 150000/2026"), { tipo: "Protocolo", detalhe: "150000/2026" });
  assert.deepEqual(rotuloCamada("DFD 1000"), { tipo: "DFD", detalhe: "1000" });
  assert.deepEqual(rotuloCamada("Item 3 — DFD 1000"), { tipo: "Item", detalhe: "3" });
  assert.deepEqual(rotuloCamada("Item — — DFD 1000"), { tipo: "Item", detalhe: "DFD 1000" });
  assert.deepEqual(rotuloCamada("Histórico do protocolo"), { tipo: "Histórico", detalhe: "do protocolo" });
  assert.deepEqual(rotuloCamada("Pendências — Protocolo 1/2026"), { tipo: "Pendências", detalhe: "Protocolo 1/2026" });
  assert.deepEqual(rotuloCamada("Protocolo"), { tipo: "Protocolo", detalhe: "" });
});

test("carrossel: peteleco no sentido contrário ao arrasto não troca de camada", () => {
  // Arrastou para a esquerda (delta < 0) e puxou de volta rápido para a direita: fica.
  assert.equal(camadaAoSoltar(0, 3, -30, 390, 0.8), 0);
  // Mesmo sentido: troca.
  assert.equal(camadaAoSoltar(0, 3, -30, 390, -0.8), 1);
});
