import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { arrastar, baseVisivel, normalizarRecorte, retanguloOrigem } from "../src/lib/recorte-imagem.ts";

describe("recorte-imagem (4:5)", () => {
  it("base visível para imagem panorâmica e retrato", () => {
    assert.deepEqual(baseVisivel(2000, 1000), { w: 800, h: 1000 });
    assert.deepEqual(baseVisivel(800, 2000), { w: 800, h: 1000 });
    assert.deepEqual(baseVisivel(0, 10), { w: 0, h: 0 });
  });
  it("recorte centralizado e sempre dentro da imagem", () => {
    assert.deepEqual(retanguloOrigem(2000, 1000, { zoom: 1, dx: 0, dy: 0 }), { sx: 600, sy: 0, sw: 800, sh: 1000 });
    const r = retanguloOrigem(2000, 1000, { zoom: 2, dx: 1, dy: -1 });
    assert.ok(r.sx + r.sw <= 2000 && r.sx >= 0 && r.sy >= 0 && r.sy + r.sh <= 1000);
  });
  it("normaliza valores fora da faixa", () => {
    assert.deepEqual(normalizarRecorte({ zoom: 9, dx: 3, dy: Number.NaN }), { zoom: 4, dx: 1, dy: 0 });
  });
  it("arrastar para a direita mostra mais da esquerda", () => {
    const r = arrastar({ zoom: 1, dx: 0, dy: 0 }, 100, 0, 400, 2000, 1000);
    assert.ok(r.dx < 0);
    assert.equal(r.dy, 0); // sem sobra vertical
  });
});
