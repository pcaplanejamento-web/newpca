import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chavePadrao, type EdicaoTabela, edicaoInicial, edicoesDaChave, idPadrao } from "../src/lib/edicoes-tabela-core.ts";
import { criarEdicaoSchema, editarEdicaoSchema } from "../src/lib/preferencias-validation.ts";

const K = "orcamento-comparativo:unidade:nomeElemento";
const e = (id: number, nome: string, minha: boolean, publico: boolean, chave = K): EdicaoTabela => ({ id, chave, nome, publico, minha, autor: "Ana", valor: {} });
const LISTA = [e(1, "Zeta", true, false), e(2, "Alfa", true, true), e(3, "Beta", false, true), e(4, "Privada de outro", false, false), e(5, "Outra tabela", true, false, "x")];

describe("edicoes-tabela", () => {
  it("o usuário vê as DELE e as PÚBLICAS dos outros, por nome, só da tabela", () => {
    const { minhas, publicas } = edicoesDaChave(LISTA, K);
    assert.deepEqual(
      minhas.map((x) => x.id),
      [2, 1],
    );
    assert.deepEqual(
      publicas.map((x) => x.id),
      [3],
    );
  });

  it("a edição PADRÃO do usuário (e o padrão do sistema quando ela sumiu)", () => {
    assert.equal(chavePadrao(K), `padrao:${K}`);
    assert.equal(idPadrao({ [chavePadrao(K)]: { id: 3 } }, K), 3);
    assert.equal(idPadrao({ [chavePadrao(K)]: { id: "3" } }, K), null);
    assert.equal(edicaoInicial(LISTA, { [chavePadrao(K)]: { id: 3 } }, K)?.nome, "Beta");
    assert.equal(edicaoInicial(LISTA, { [chavePadrao(K)]: { id: 4 } }, K), null, "privada de outro não vale");
    assert.equal(edicaoInicial(LISTA, {}, K), null);
  });

  it("schemas: nome obrigatório (≤ 60), visibilidade, layout com teto; atualizar exige algo", () => {
    assert.ok(criarEdicaoSchema.safeParse({ chave: K, nome: " Minha ", publico: false, valor: { v: 2 } }).success);
    assert.ok(!criarEdicaoSchema.safeParse({ chave: K, nome: " ", publico: false, valor: {} }).success);
    assert.ok(!criarEdicaoSchema.safeParse({ chave: K, nome: "x".repeat(61), publico: true, valor: {} }).success);
    assert.ok(!criarEdicaoSchema.safeParse({ chave: K, nome: "a", publico: true, valor: { g: "a".repeat(40_000) } }).success);
    assert.ok(editarEdicaoSchema.safeParse({ publico: true }).success);
    assert.ok(!editarEdicaoSchema.safeParse({}).success);
  });
});
