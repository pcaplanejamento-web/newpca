import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { avaliarDfd, dfdsDuplicados, itensDuplicados, removerItemDfd } from "../src/lib/dfd-tratamento.ts";

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

describe("itensDuplicados (mesmo código E mesma descrição)", () => {
  it("sem duplicatas ⇒ vazio", () => {
    assert.deepEqual(itensDuplicados([it_("111", "A"), it_("222", "B")]), []);
  });

  it("mesmo código + mesma descrição ⇒ um grupo (mesmo com formatação/pontos diferentes)", () => {
    assert.deepEqual(itensDuplicados([it_("524.193.7263", "X"), it_("5241937263", "x")]), [[0, 1]]);
  });

  it("mesmo código com descrição DIFERENTE (outro local — DFD 136 real) ⇒ NÃO duplica", () => {
    assert.deepEqual(
      itensDuplicados([
        it_("524194056", "LOCAÇÃO DE EQUIPAMENTOS - SECRETARIA DE AGRICULTURA (ALMOXARIFADO)"),
        it_("524194056", "LOCAÇÃO DE EQUIPAMENTOS - SECRETARIA DE AGRICULTURA- HORTA"),
      ]),
      [],
    );
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
    assert.deepEqual(itensDuplicados([it_("9", "a"), it_("9", "A"), it_("9", "á")]), [[0, 1, 2]]);
  });
});

describe("item duplicado — avaliação + tratamento (remover)", () => {
  const base = {
    planejamento: "640",
    reparticaoId: 1,
    tipo: "DFD-S",
    secoes: [
      { titulo: "JUSTIFICATIVA", texto: "j" },
      { titulo: "PREVISÃO DE ENTREGA", texto: "ANUAL" },
      { titulo: "PRIORIDADE", texto: "ALTA" },
      { titulo: "FUNDAMENTAÇÃO LEGAL", texto: "Lei 14.133/2021" },
    ],
  };
  const itens = [
    { item: 1, codigo: "9", descricao: "A", quantidade: 1, valorUnitario: 10, valorTotal: 10, unidade: "UN" },
    { item: 2, codigo: "9", descricao: "A", quantidade: 1, valorUnitario: 10, valorTotal: 10, unidade: "UN" },
  ];
  it("aponta o repetido (bloqueia por padrão) e some após remover", () => {
    assert.ok(avaliarDfd({ ...base, itens }).bloqueantes.some((b) => b.includes("duplicados")));
    const d = removerItemDfd({ itens, valorTotal: 20 }, 1);
    assert.equal(d.itens.length, 1);
    assert.equal(d.valorTotal, 10);
    assert.deepEqual(avaliarDfd({ ...base, itens: d.itens }).bloqueantes, []);
  });
});
