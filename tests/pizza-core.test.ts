import assert from "node:assert/strict";
import { test } from "node:test";
import { ANG_MIN, angulosPizza } from "../src/lib/pizza-core.ts";

test("fatia pequena ganha o ângulo mínimo e a soma fecha a volta", () => {
  const a = angulosPizza([611, 383, 6]);
  assert.ok(a[2] >= ANG_MIN - 1e-9);
  assert.ok(Math.abs(a.reduce((t, x) => t + x, 0) - 2 * Math.PI) < 1e-9);
  assert.ok(a[0] > a[1] && a[1] > a[2]);
});

test("sem fatias pequenas, os ângulos são proporcionais", () => {
  const a = angulosPizza([1, 1]);
  assert.ok(Math.abs(a[0] - Math.PI) < 1e-9);
  assert.deepEqual(angulosPizza([0, 0]), [0, 0]);
});
