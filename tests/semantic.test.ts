import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { avatarVar, naturezaVar, situacaoVar } from "../src/lib/semantic.ts";

describe("semantic tokens (rótulo → var)", () => {
  it("naturezaVar mapeia por prefixo", () => {
    assert.equal(naturezaVar("INCLUSÃO 2027"), "var(--nat-inclusao-2027)");
    assert.equal(naturezaVar("INCLUSAO 2026 - item"), "var(--nat-inclusao-2026)");
    assert.equal(naturezaVar("EXCLUSÃO"), "var(--nat-exclusao)");
    assert.equal(naturezaVar("CORREÇÃO"), "var(--nat-correcao)");
    assert.equal(naturezaVar("COMUNICAÇÃO INTERNA"), "var(--nat-comunicacao)");
    assert.equal(naturezaVar(null), "var(--faint)");
    assert.equal(naturezaVar("OUTRA COISA"), "var(--faint)");
  });

  it("situacaoVar mapeia o enum", () => {
    assert.equal(situacaoVar("em_analise"), "var(--sit-em-analise)");
    assert.equal(situacaoVar("em_andamento"), "var(--sit-em-andamento)");
    assert.equal(situacaoVar("finalizado"), "var(--sit-finalizado)");
    assert.equal(situacaoVar("inexistente"), "var(--faint)");
    assert.equal(situacaoVar(null), "var(--faint)");
  });

  it("avatarVar: conhecidos, vazio e determinístico", () => {
    assert.equal(avatarVar("Jhone Prado"), "var(--av-jhone)");
    assert.equal(avatarVar("maria"), "var(--av-maria)");
    assert.equal(avatarVar(""), "var(--faint)");
    assert.equal(avatarVar("   "), "var(--faint)");
    assert.equal(avatarVar("Fulano X"), avatarVar("Fulano X"));
    assert.ok(avatarVar("Fulano X").startsWith("var(--av-"));
  });
});
