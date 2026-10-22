import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classificarAlteracaoItem, numeroFormatado, resumoAlteracoesItens } from "../src/lib/alteracao-itens-core.ts";

const alt = (campos: { campo: string; antes: string; depois: string }[]) => ({ tipo: "alterado" as const, item: 1, codigo: "1", descricao: "X", campos: campos.map((c) => ({ ...c, rotulo: c.campo })) });

describe("acréscimo × supressão de itens", () => {
  it("lê números formatados em pt-BR", () => {
    assert.equal(numeroFormatado("R$ 1.234,56"), 1234.56);
    assert.equal(numeroFormatado("1.000"), 1000);
    assert.equal(numeroFormatado("—"), null);
  });
  it("classifica pelo valor total, depois pela quantidade", () => {
    assert.equal(classificarAlteracaoItem(alt([{ campo: "quantidade", antes: "10", depois: "15" }, { campo: "valorTotal", antes: "R$ 100,00", depois: "R$ 150,00" }])).classe, "acrescimo");
    assert.equal(classificarAlteracaoItem(alt([{ campo: "quantidade", antes: "10", depois: "4" }])).classe, "supressao");
    assert.equal(classificarAlteracaoItem(alt([{ campo: "descricao", antes: "A", depois: "B" }])).classe, "sem-impacto");
    assert.equal(classificarAlteracaoItem({ tipo: "novo", item: 2, codigo: null, descricao: null, campos: [] }).classe, "inclusao");
    assert.equal(classificarAlteracaoItem({ tipo: "removido", item: 2, codigo: null, descricao: null, campos: [] }).classe, "exclusao");
  });
  it("resume com as somas de valor", () => {
    const r = resumoAlteracoesItens([
      alt([{ campo: "valorTotal", antes: "R$ 100,00", depois: "R$ 150,00" }]),
      alt([{ campo: "valorTotal", antes: "R$ 80,00", depois: "R$ 30,00" }]),
      { tipo: "removido", item: 3, codigo: null, descricao: null, campos: [] },
    ]);
    assert.deepEqual([r.acrescimo, r.supressao, r.exclusao, r.valorAcrescido, r.valorSuprimido], [1, 1, 1, 50, 50]);
  });
});
