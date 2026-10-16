import assert from "node:assert/strict";
import { test } from "node:test";
import { alternarFavorito, lerFavoritos, MAX_FAVORITOS, moverFavorito } from "../src/lib/pesquisa-favoritos-core.ts";

const f = (n: number) => ({ chave: `tela:${n}`, rotulo: `T${n}`, href: `/painel/x${n}`, tipo: "tela" });

test("lerFavoritos descarta inválidos, externos e repetidos", () => {
  const l = lerFavoritos({ itens: [f(1), f(1), { ...f(2), href: "https://mal.com" }, { ...f(3), href: "//mal.com" }, null, { chave: "a" }, f(4)] });
  assert.deepEqual(l.map((x) => x.chave), ["tela:1", "tela:4"]);
  assert.deepEqual(lerFavoritos("x"), []);
});

test("alternar põe no topo, tira e respeita o teto", () => {
  let l = alternarFavorito([], f(1)).lista;
  l = alternarFavorito(l, f(2)).lista;
  assert.deepEqual(l.map((x) => x.chave), ["tela:2", "tela:1"]);
  assert.deepEqual(alternarFavorito(l, f(1)).lista.map((x) => x.chave), ["tela:2"]);
  const cheia = Array.from({ length: MAX_FAVORITOS }, (_, i) => f(i));
  assert.equal(alternarFavorito(cheia, f(99)).cheio, true);
});

test("mover troca vizinhos e para nas pontas", () => {
  const l = [f(1), f(2), f(3)];
  assert.deepEqual(moverFavorito(l, "tela:3", -1).map((x) => x.chave), ["tela:1", "tela:3", "tela:2"]);
  assert.equal(moverFavorito(l, "tela:1", -1), l);
});
