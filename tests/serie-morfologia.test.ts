import assert from "node:assert/strict";
import test from "node:test";
import { amostrarMonotona, escalaDoQuadro, morfologia, type QuadroSerie } from "../src/lib/serie-morfologia.ts";

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
  const de: QuadroSerie = { linhas: [0, 1, 2, 3, 4].map((t) => ({ chave: `d${t}`, t, a: t * 10 })), lo: 0, hi: 4, ylo: 0, yhi: 40 };
  const para: QuadroSerie = { linhas: [0.5, 2, 3.5].map((t) => ({ chave: `m${t}`, t, a: 100 })), lo: 0.5, hi: 3.5, ylo: 0, yhi: 100 };
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

test("morfologia: escalas muito diferentes (Por período, Dia → Mês) — a altura NA TELA vai em linha reta", () => {
  // Dia: valores até 10; mês: até 300 (30×). Misturar os valores crus faria o mês dominar já no começo.
  const de: QuadroSerie = { linhas: [0, 1, 2, 3].map((t) => ({ chave: `d${t}`, t, a: [2, 10, 5, 8][t] })), lo: 0, hi: 3, ylo: 0, yhi: 10 };
  const para: QuadroSerie = { linhas: [0, 3].map((t) => ({ chave: `m${t}`, t, a: [300, 150][t / 3] })), lo: 0, hi: 3, ylo: 0, yhi: 300 };
  const f = morfologia(de, para, ["a"]);
  const altura = (q: QuadroSerie, t: number) => {
    const l = q.linhas.find((x) => x.t === t);
    return ((Number(l?.a) || 0) - q.ylo) / (q.yhi - q.ylo);
  };
  const h0 = altura(f(0), 1);
  const h1 = amostrarMonotona([0, 3], [300, 150], [1])[0] / 300;
  for (const k of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const h = altura(f(k), 1);
    assert.ok(Math.abs(h - (h0 + (h1 - h0) * k)) < 1e-9, `k=${k}: a altura é a mistura das alturas (${h})`);
  }
  assert.ok(Math.abs(f(0.1).yhi - 39) < 1e-9, "a escala também desliza");
});

test("morfologia: a marca (hoje) desliza; a escala do quadro só olha a janela", () => {
  const q = (marca: number | null, lo: number): QuadroSerie => ({ linhas: [{ chave: "a", t: lo, v: 1 }], lo, hi: lo + 1, ylo: 0, yhi: 1, marca });
  assert.equal(morfologia(q(2, 0), q(4, 0), ["v"])(0.5).marca, 3);
  assert.equal(morfologia(q(null, 0), q(4, 0), ["v"])(0.5).marca, 4, "sem marca antes: vale a nova");
  const linhas = [0, 1, 2, 3].map((t) => ({ chave: String(t), t, v: [100, 2, 4, 50][t] }));
  assert.deepEqual(escalaDoQuadro(linhas, 1, 2, ["v"]), { ylo: 0, yhi: 4 });
  const aj = escalaDoQuadro(linhas, 1, 2, ["v"], { ajustar: true, folga: 1.5 });
  assert.equal(aj.yhi, 6);
  assert.ok(aj.ylo > 1.7 && aj.ylo < 2);
  assert.deepEqual(escalaDoQuadro([], 0, 1, ["v"]), { ylo: 0, yhi: 1 });
});
