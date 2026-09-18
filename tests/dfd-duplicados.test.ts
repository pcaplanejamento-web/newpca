import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dfdsDuplicados, itensDuplicados } from "../src/lib/dfd-tratamento.ts";

const d = (numero: string, planejamento: string | null = null) => ({ numero, planejamento });
const it_ = (codigo: string | null, descricao: string | null = null) => ({ codigo, descricao });

describe("dfdsDuplicados (mesmo nº de DFD OU de planejamento, transitivo)", () => {
  it("sem duplicatas ⇒ vazio", () => {
    assert.deepEqual(dfdsDuplicados([d("1", "10"), d("2", "20"), d("3", "30")]), []);
  });

  it("mesmo nº de DFD ⇒ um grupo", () => {
    assert.deepEqual(dfdsDuplicados([d("1586", "10"), d("1586", "11")]), [[0, 1]]);
  });

  it("mesmo nº de planejamento ⇒ um grupo", () => {
    assert.deepEqual(dfdsDuplicados([d("1", "640"), d("2", "640")]), [[0, 1]]);
  });

  it("TRANSITIVO: A~B por número, B~C por planejamento ⇒ um só grupo {A,B,C}", () => {
    // A(1,10) — B(1,11) mesmo número; B(1,11) — C(2,11) mesmo planejamento.
    assert.deepEqual(dfdsDuplicados([d("1", "10"), d("1", "11"), d("2", "11")]), [[0, 1, 2]]);
  });

  it("planejamento VAZIO/null NÃO liga DFDs", () => {
    assert.deepEqual(dfdsDuplicados([d("1", null), d("2", null), d("3", "")]), []);
  });

  it("dois grupos independentes + um único", () => {
    // 0,1 (num A) ; 2,3 (plan P) ; 4 sozinho.
    const grupos = dfdsDuplicados([d("A", "1"), d("A", "2"), d("X", "P"), d("Y", "P"), d("Z", "9")]);
    assert.deepEqual(grupos, [
      [0, 1],
      [2, 3],
    ]);
  });

  it("ignora espaços em volta do número/planejamento", () => {
    assert.deepEqual(dfdsDuplicados([d(" 1586 ", "10"), d("1586", "99")]), [[0, 1]]);
  });

  it("lista vazia / de 1 ⇒ vazio", () => {
    assert.deepEqual(dfdsDuplicados([]), []);
    assert.deepEqual(dfdsDuplicados([d("1", "10")]), []);
  });
});

describe("itensDuplicados (mesmo código; sem código, a descrição)", () => {
  it("sem duplicatas ⇒ vazio", () => {
    assert.deepEqual(itensDuplicados([it_("111", "A"), it_("222", "B")]), []);
  });

  it("mesmo código ⇒ um grupo (mesmo com formatação/pontos diferentes)", () => {
    assert.deepEqual(itensDuplicados([it_("524.193.7263", "X"), it_("5241937263", "Y")]), [[0, 1]]);
  });

  it("sem código, mesma descrição (acentos/caixa ignorados) ⇒ duplicado", () => {
    assert.deepEqual(itensDuplicados([it_(null, "Cimento CP-II"), it_("", "CIMENTO cp-ii")]), [[0, 1]]);
  });

  it("sem código, descrições diferentes ⇒ não duplica", () => {
    assert.deepEqual(itensDuplicados([it_(null, "Cimento"), it_(null, "Areia")]), []);
  });

  it("item sem código E sem descrição é ignorado (não vira grupo)", () => {
    assert.deepEqual(itensDuplicados([it_(null, null), it_(null, "")]), []);
  });

  it("três iguais ⇒ um grupo com os três índices", () => {
    assert.deepEqual(itensDuplicados([it_("9", "a"), it_("9", "b"), it_("9", "c")]), [[0, 1, 2]]);
  });
});
