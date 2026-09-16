import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMINIOS, LOGICAS } from "../src/lib/logicas.ts";

describe("logicas (catálogo narrativo da aba Referência)", () => {
  const chaves = new Set(DOMINIOS.map((d) => d.key));

  it("ids são únicos", () => {
    const ids = LOGICAS.map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("todo item tem título/descrição não-vazios e domínio válido", () => {
    for (const l of LOGICAS) {
      assert.ok(l.titulo.trim().length > 0, `título vazio em ${l.id}`);
      assert.ok(l.descricao.trim().length > 0, `descrição vazia em ${l.id}`);
      assert.ok(chaves.has(l.dominio), `domínio inválido em ${l.id}: ${l.dominio}`);
    }
  });

  it("todo domínio tem ao menos um item", () => {
    for (const d of DOMINIOS) {
      assert.ok(
        LOGICAS.some((l) => l.dominio === d.key),
        `domínio sem itens: ${d.key}`,
      );
    }
  });

  it("configuravelEm sempre traz rótulo quando presente", () => {
    for (const l of LOGICAS) {
      if (l.configuravelEm) assert.ok(l.configuravelEm.rotulo.trim().length > 0, `rótulo vazio em ${l.id}`);
    }
  });
});
