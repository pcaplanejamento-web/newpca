import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffCampos, mesclarHistorico, ROTULO_ACAO, ROTULO_ENTIDADE } from "../src/lib/auditoria-core.ts";

describe("auditoria-core", () => {
  it("diffCampos: só os campos que mudaram + resumo legível", () => {
    const r = diffCampos<{ quantidade: number; valorUnitario: number; descricao: string }>(
      { quantidade: 20, valorUnitario: 5.11, descricao: "A" },
      { quantidade: 35, valorUnitario: 5.11, descricao: "B" },
      ["quantidade", "valorUnitario", "descricao"],
      { quantidade: "Quantidade", descricao: "Descrição" },
    );
    assert.equal(r.mudou, true);
    assert.deepEqual(r.antes, { quantidade: 20, descricao: "A" });
    assert.deepEqual(r.depois, { quantidade: 35, descricao: "B" });
    assert.ok(r.resumo.includes("Quantidade: 20 → 35"), r.resumo);
    assert.ok(r.resumo.includes("Descrição: A → B"), r.resumo);
    assert.ok(!r.resumo.includes("valorUnitario"), "campo inalterado não entra no resumo");
  });

  it("diffCampos: nada mudou → mudou=false, resumo vazio", () => {
    const r = diffCampos({ a: 1 }, { a: 1 }, ["a"]);
    assert.equal(r.mudou, false);
    assert.equal(r.resumo, "");
    assert.deepEqual(r.antes, {});
  });

  it("diffCampos: null/vazio vira — no resumo", () => {
    const r = diffCampos<{ x: string | null }>({ x: null }, { x: "novo" }, ["x"]);
    assert.equal(r.mudou, true);
    assert.ok(r.resumo.includes("— → novo"), r.resumo);
  });

  it("rótulos de ação e entidade", () => {
    assert.equal(ROTULO_ACAO.editar, "Editou");
    assert.equal(ROTULO_ACAO.importar, "Importou");
    assert.equal(ROTULO_ENTIDADE.dfd, "DFD");
    assert.equal(ROTULO_ENTIDADE.reparticao, "Unidade");
  });

  it("mesclarHistorico: intercala fluxos por id decrescente (mais recente primeiro)", () => {
    const dfd = [{ id: 10 }, { id: 4 }, { id: 2 }];
    const proto = [{ id: 9 }, { id: 5 }, { id: 1 }];
    const r = mesclarHistorico([dfd, proto]);
    assert.deepEqual(
      r.map((e) => e.id),
      [10, 9, 5, 4, 2, 1],
    );
  });

  it("mesclarHistorico: respeita o teto e tolera fluxo vazio", () => {
    const r = mesclarHistorico([[{ id: 3 }, { id: 1 }], []], 1);
    assert.deepEqual(r, [{ id: 3 }]);
  });
});
