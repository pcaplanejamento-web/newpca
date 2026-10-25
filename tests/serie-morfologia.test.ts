import assert from "node:assert/strict";
import test from "node:test";
import { amostrarMonotona, morfologia, type QuadroSerie } from "../src/lib/serie-morfologia.ts";

test("morfologia: a curva monótona passa pelos pontos, não passa dos vizinhos e prende as pontas", () => {
  const xs = [0, 1, 2, 3];
  const ys = [0, 10, 10, 30];
  assert.deepEqual(amostrarMonotona(xs, ys, xs), ys);
  const meio = amostrarMonotona(xs, ys, [1.5]);
  assert.ok(Math.abs(meio[0] - 10) < 1e-9, "trecho plano fica plano (monótona)");
  assert.deepEqual(amostrarMonotona(xs, ys, [-5, 9]), [0, 30], "fora do intervalo = a ponta");
  assert.deepEqual(amostrarMonotona([5], [7], [0, 9]), [7, 7]);
});

test("morfologia: começa na curva antiga, termina na nova e mistura a janela (Dia → Mês, zoom)", () => {
  const de: QuadroSerie = { linhas: [0, 1, 2, 3, 4].map((t) => ({ chave: `d${t}`, t, a: t * 10 })), lo: 0, hi: 4 };
  const para: QuadroSerie = { linhas: [0.5, 2, 3.5].map((t) => ({ chave: `m${t}`, t, a: 100 })), lo: 0.5, hi: 3.5 };
  const f = morfologia(de, para, ["a"]);
  const q0 = f(0);
  for (const l of q0.linhas) if (Number.isInteger(l.t)) assert.equal(l.a, l.t * 10, "no início, os pontos antigos intactos");
  assert.equal(f(1), para, "no fim, o quadro novo intacto");
  const q = f(0.5);
  assert.equal(q.lo, 0.25);
  assert.equal(q.hi, 3.75);
  assert.ok(q.linhas.every((l) => String(l.chave).startsWith("m")), "a chave é sempre a de um ponto novo");
  const ts = q.linhas.map((l) => l.t);
  assert.deepEqual(ts, [...ts].sort((x, y) => x - y), "posições em ordem, sem repetir");
  assert.equal(new Set(ts).size, ts.length);
});
