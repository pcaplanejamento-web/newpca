import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DETALHES_PADRAO } from "../src/lib/papeis-detalhes-core.ts";
import { criarPapelSchema, detalhesPapelSchema, editarPapelSchema } from "../src/lib/papeis-validation.ts";

// Configurações → Papéis: o que o servidor aceita ao criar/editar um papel.

describe("papéis — validação", () => {
  it("normaliza as capacidades: qualquer ação liga o Visualizar; ação que não se aplica sai", () => {
    const r = criarPapelSchema.safeParse({ nome: "Consulta da Mesa", capacidades: { dfd: ["exportar"], orcamento: ["manipular"] } });
    assert.equal(r.success, true);
    // Orçamento: "manipular" não se aplica → a tela some (nenhuma ação válida).
    assert.deepEqual(r.success && r.data.capacidades, { dfd: ["visualizar", "exportar"] });
  });

  it("recusa tela ou ação fora do catálogo", () => {
    assert.equal(criarPapelSchema.safeParse({ nome: "X1", capacidades: { admin: ["visualizar"] } }).success, false);
    assert.equal(criarPapelSchema.safeParse({ nome: "X1", capacidades: { dfd: ["voar"] } }).success, false);
  });

  it("nome: 2 a 40 caracteres, sem caractere de controle; descrição opcional até 200", () => {
    assert.equal(criarPapelSchema.safeParse({ nome: "A", capacidades: {} }).success, false);
    assert.equal(criarPapelSchema.safeParse({ nome: "x".repeat(41), capacidades: {} }).success, false);
    assert.equal(criarPapelSchema.safeParse({ nome: "Com\u0007sino", capacidades: {} }).success, false);
    assert.equal(criarPapelSchema.safeParse({ nome: "Ok", capacidades: {}, descricao: "d".repeat(201) }).success, false);
    const r = criarPapelSchema.safeParse({ nome: "  Leitura  ", capacidades: {}, descricao: null });
    assert.equal(r.success && r.data.nome, "Leitura");
  });

  it("edição: só o que veio; vazio = recusado", () => {
    assert.equal(editarPapelSchema.safeParse({}).success, false);
    const r = editarPapelSchema.safeParse({ padraoCadastro: true });
    assert.equal(r.success, true);
    assert.equal(r.success && r.data.capacidades, undefined);
  });

  it("detalhes: normaliza sobre o padrão, com as implicações; ausente = sem restrições", () => {
    const r = criarPapelSchema.safeParse({ nome: "Só os meus", capacidades: {}, detalhes: { mesa: { linhas: "meus", responsavel: { ver: false, alterar: "grupo" } } } });
    assert.equal(r.success, true);
    const d = r.success ? r.data.detalhes : undefined;
    assert.equal(d?.mesa.linhas, "meus");
    // Sem ver o Responsável, não altera (a implicação vale mesmo que o corpo peça "grupo").
    assert.deepEqual(d?.mesa.responsavel, { ver: false, alterar: "nao" });
    const semDetalhes = criarPapelSchema.safeParse({ nome: "Normal", capacidades: {} });
    assert.equal(semDetalhes.success && semDetalhes.data.detalhes, undefined);
  });

  it("detalhes: só os que o sistema já aplica — os demais são descartados (nunca gravados 'de enfeite')", () => {
    const r = detalhesPapelSchema.safeParse({
      mesa: { distribuicao: false, valores: false, dadosPessoais: "mascarar", colunasOcultas: { protocolos: ["estado"] }, alteracoes: { capa: false } },
      historico: { dfd: "nao" },
      edicoes: { dfd: { publicar: false } },
    });
    assert.equal(r.success, true);
    const d = r.success ? r.data : DETALHES_PADRAO;
    assert.equal(d.mesa.distribuicao, false);
    assert.equal(d.mesa.valores, true);
    assert.equal(d.mesa.dadosPessoais, "ver");
    assert.deepEqual(d.mesa.colunasOcultas, DETALHES_PADRAO.mesa.colunasOcultas);
    assert.deepEqual(d.mesa.alteracoes, DETALHES_PADRAO.mesa.alteracoes);
    assert.deepEqual(d.historico, DETALHES_PADRAO.historico);
    assert.deepEqual(d.edicoes, DETALHES_PADRAO.edicoes);
  });

  it("detalhes: nível fora do catálogo é recusado; a edição aceita só os detalhes", () => {
    assert.equal(detalhesPapelSchema.safeParse({ mesa: { responsavel: { alterar: "todos" } } }).success, false);
    assert.equal(detalhesPapelSchema.safeParse({ mesa: { linhas: "alguns" } }).success, false);
    const r = editarPapelSchema.safeParse({ detalhes: { mesa: { desempenho: false } } });
    assert.equal(r.success, true);
    assert.equal(r.success && r.data.detalhes?.mesa.desempenho, false);
  });
});
