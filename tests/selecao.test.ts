import assert from "node:assert/strict";
import { test } from "node:test";
import { atributosVisao, type VisaoOrcamento } from "../src/lib/orcamento-visao.ts";
import { corSegura, dicaDaOpcao, filtrarOpcoes, type OpcaoSelecao, opcoesIguais, proximaHabilitada, typeahead } from "../src/lib/selecao-core.ts";

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

test("corSegura aceita só hex, var(--token) e rgb/hsl", () => {
  assert.equal(corSegura("#16a34a"), "#16a34a");
  assert.equal(corSegura("var(--warn)"), "var(--warn)");
  assert.equal(corSegura("rgb(1, 2, 3)"), "rgb(1, 2, 3)");
  assert.equal(corSegura("red;background:url(x)"), undefined);
  assert.equal(corSegura("url(javascript:x)"), undefined);
  assert.equal(corSegura(undefined), undefined);
});

test("dicaDaOpcao junta o title e o aviso; a busca acha pelo detalhe", () => {
  assert.equal(dicaDaOpcao({ valor: "1", texto: "A", dica: "x", aviso: "y" }), "x — y");
  assert.equal(dicaDaOpcao({ valor: "1", texto: "A" }), undefined);
  const op = [
    { valor: "1", texto: "PCA 27", detalhe: "2 Funções · usada em 1 PCA" },
    { valor: "2", texto: "Geral" },
  ];
  assert.deepEqual(
    filtrarOpcoes(op, "funcoes").map((o) => o.valor),
    ["1"],
  );
});

test("atributosVisao: detalhe com o resumo e os PCAs, aviso só com ausentes", () => {
  const v = { id: 1, nome: "PCA 27", filtros: { funcao: ["10"] }, ordem: 0, proprias: [], pcas: ["PCA 2027"] } as unknown as VisaoOrcamento;
  const a = atributosVisao(v, 0);
  assert.match(a["data-detalhe"], /usada em 1 PCA$/);
  assert.equal(a["data-aviso"], undefined);
  assert.equal(atributosVisao(v, 2)["data-aviso"], "2 valor(es) da visão fora deste orçamento");
});
