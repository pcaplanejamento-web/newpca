import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { acaoParaGravar, chavePadrao, type EdicaoTabela, edicaoInicial, edicoesDaChave, idPadrao, telasDaChave } from "../src/lib/edicoes-tabela-core.ts";
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

  it("a TELA da tabela de cada chave (a Mesa, a do PCA, o Comparativo, a Lista de um quadro); outra chave é recusada", () => {
    assert.deepEqual(telasDaChave("mesa:protocolos"), { telas: ["dfd"], quadroId: null });
    assert.deepEqual(telasDaChave("mesa-pca:itens"), { telas: ["pca"], quadroId: null });
    assert.deepEqual(telasDaChave(K), { telas: ["orcamento", "pca"], quadroId: null }, "o Comparativo está no Orçamento e no PCA");
    assert.deepEqual(telasDaChave("tarefas:12:lista"), { telas: ["tarefas"], quadroId: 12 }, "a Lista segue o grupo do quadro");
    for (const k of ["tarefas:0:lista", "tarefas:abc:lista", "tarefas:12", "calendario:ocultos", "padrao:mesa:dfds", "x", "", "design-system:demo"])
      assert.equal(telasDaChave(k), null, k);
  });

  it("GRAVAR: a sua (só para você) = Visualizar; publicar = Configurar; o dono despublica e exclui sempre; moderar = Configurar", () => {
    const g = (dono: boolean, publicoAntes: boolean, publicoDepois: boolean, excluir = false) => acaoParaGravar({ dono, publicoAntes, publicoDepois, excluir });
    assert.equal(g(true, false, false), "visualizar", "criar/atualizar a sua privada");
    assert.equal(g(true, false, true), "configurar", "publicar");
    assert.equal(g(true, true, true), "configurar", "alterar a sua pública (todos a veem)");
    assert.equal(g(true, true, false), null, "despublicar a sua: nunca recusado");
    assert.equal(g(true, true, true, true), null, "excluir a sua pública: nunca recusado");
    assert.equal(g(true, false, false, true), null, "excluir a sua privada");
    assert.equal(g(false, true, true), "configurar", "alterar a pública de outra pessoa (moderar)");
    assert.equal(g(false, true, true, true), "configurar", "excluir a pública de outra pessoa (moderar)");
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
