import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hexToHsv, hexToRgb, hsvToHex, normalizeHex, rgbToHex, textoSobre } from "../src/lib/color.ts";

describe("color (hex ↔ rgb ↔ hsv)", () => {
  it("normalizeHex aceita #rgb / rrggbb e rejeita inválidos", () => {
    assert.equal(normalizeHex("#4F46E5"), "#4f46e5");
    assert.equal(normalizeHex("abc"), "#aabbcc");
    assert.equal(normalizeHex("#fff"), "#ffffff");
    assert.equal(normalizeHex("xyz"), null);
    assert.equal(normalizeHex("#12345"), null);
  });

  it("hexToRgb / rgbToHex", () => {
    assert.deepEqual(hexToRgb("#4f46e5"), [79, 70, 229]);
    assert.equal(rgbToHex(79, 70, 229), "#4f46e5");
    assert.equal(rgbToHex(0, 0, 0), "#000000");
    assert.equal(rgbToHex(300, -5, 255), "#ff00ff"); // clamp
  });

  it("round-trip HSV preserva cores primárias/neutras", () => {
    for (const hex of ["#ffffff", "#000000", "#ff0000", "#00ff00", "#0000ff", "#808080"]) {
      const hsv = hexToHsv(hex);
      assert.ok(hsv);
      assert.equal(hsvToHex(hsv[0], hsv[1], hsv[2]), hex);
    }
  });
});

describe("textoSobre", () => it("textoSobre: escuro sobre cor clara, branco sobre cor escura", () => {
  assert.equal(textoSobre("#ffffff"), "var(--sobre-claro)");
  assert.equal(textoSobre("#7dd3fc"), "var(--sobre-claro)");
  assert.equal(textoSobre("#16a34a"), "var(--sobre-claro)");
  assert.equal(textoSobre("#9333ea"), "var(--sobre-escuro)");
  assert.equal(textoSobre("#1e3a8a"), "var(--sobre-escuro)");
  assert.equal(textoSobre("lixo"), "var(--sobre-escuro)");
}));
