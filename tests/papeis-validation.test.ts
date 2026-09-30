import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { criarPapelSchema, editarPapelSchema } from "../src/lib/papeis-validation.ts";

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
});
