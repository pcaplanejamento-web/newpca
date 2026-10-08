import assert from "node:assert/strict";
import { test } from "node:test";
import { filtrarOpcoes, type OpcaoSelecao, opcoesIguais, proximaHabilitada, typeahead } from "../src/lib/selecao-core.ts";

const OP: OpcaoSelecao[] = [
  { valor: "", texto: "Orçamento inteiro" },
  { valor: "1", texto: "PCA 27", grupo: "Visões" },
  { valor: "2", texto: "Geral - sem filtro", grupo: "Visões", desabilitada: true },
  { valor: "3", texto: "Educação", grupo: "Visões" },
  { valor: "4", texto: "Esporte", grupo: "Outras" },
];

test("proximaHabilitada pula as desabilitadas e não sai das pontas", () => {
  assert.equal(proximaHabilitada(OP, -1, 1), 0);
  assert.equal(proximaHabilitada(OP, 1, 1), 3);
  assert.equal(proximaHabilitada(OP, 3, -1), 1);
  assert.equal(proximaHabilitada(OP, 4, 1), 4);
  assert.equal(proximaHabilitada(OP, 0, -1), 0);
  assert.equal(proximaHabilitada(OP, OP.length, -1), 4);
  assert.equal(proximaHabilitada([{ valor: "a", texto: "A", desabilitada: true }], -1, 1), -1);
  assert.equal(proximaHabilitada([], -1, 1), -1);
});

test("typeahead: prefixo sem acento/caixa, letra repetida percorre, pula desabilitadas", () => {
  assert.equal(typeahead(OP, "orc", -1), 0);
  assert.equal(typeahead(OP, "e", -1), 3);
  assert.equal(typeahead(OP, "e", 3), 4);
  assert.equal(typeahead(OP, "ee", 4), 3);
  assert.equal(typeahead(OP, "esp", 3), 4);
  assert.equal(typeahead(OP, "g", -1), -1);
  assert.equal(typeahead(OP, "", 0), -1);
  assert.equal(typeahead(OP, "x", 0), -1);
});

test("filtrarOpcoes: busca pelo texto e pelo grupo, vários termos com ':'", () => {
  assert.deepEqual(
    filtrarOpcoes(OP, "educacao").map((o) => o.valor),
    ["3"],
  );
  assert.deepEqual(
    filtrarOpcoes(OP, "outras").map((o) => o.valor),
    ["4"],
  );
  assert.deepEqual(
    filtrarOpcoes(OP, "pca:esporte").map((o) => o.valor),
    ["1", "4"],
  );
  assert.equal(filtrarOpcoes(OP, "").length, OP.length);
});

test("opcoesIguais compara o conteúdo", () => {
  assert.ok(opcoesIguais(OP, OP.map((o) => ({ ...o }))));
  assert.ok(!opcoesIguais(OP, OP.slice(1)));
  assert.ok(!opcoesIguais(OP, OP.map((o, i) => (i === 2 ? { ...o, desabilitada: false } : o))));
});
