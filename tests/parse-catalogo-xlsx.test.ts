import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCatalogoFromMatriz } from "../src/lib/parse-catalogo-xlsx-core.ts";

// Núcleo puro do parser de catálogo em PLANILHA — matrizes 2D sintéticas.
describe("parse-catalogo-xlsx-core", () => {
  it("4 colunas (Item | Cód | Descrição | Und) + título + código com pontos", () => {
    const aoa = [
      ["CATÁLOGO MATERIAL DE EXPEDIENTE"],
      ["Item", "Código", "Descrição", "Unidade de Medida"],
      ["1", "524.173.296", "ALMOFADA COM TINTA Nº 3, AZUL", "UNIDADE"],
      ["2", "5241918329", "AGENDA COSTURADA", "UNIDADE"],
    ];
    const r = parseCatalogoFromMatriz(aoa, "exp.xlsx");
    assert.equal(r.nome, "CATÁLOGO MATERIAL DE EXPEDIENTE");
    assert.equal(r.itens.length, 2);
    assert.deepEqual(r.itens[0], {
      sequencial: 1,
      codigo: "524173296",
      codigoRaw: "524173296", // salvo só com dígitos (sem pontos), = codigo
      descricao: "ALMOFADA COM TINTA Nº 3, AZUL",
      unidade: "UNIDADE",
    });
    assert.equal(r.itens[1].codigo, "5241918329");
  });

  it("colunas em ORDEM diferente (Cód | Und | Descrição), sem título e sem Nº de item", () => {
    const aoa = [
      ["Cód. Prod", "Unid", "Descrição"],
      ["524177339", "UNIDADE", "Recarga de gás 13kg"],
      ["", "", ""], // linha vazia ignorada
      ["524191567", "UNIDADE", "GLP 45kg"],
    ];
    const r = parseCatalogoFromMatriz(aoa, "gas.xlsx");
    assert.equal(r.nome, null);
    assert.equal(r.itens.length, 2);
    assert.equal(r.itens[0].sequencial, null);
    assert.equal(r.itens[0].unidade, "UNIDADE");
    assert.equal(r.itens[0].descricao, "Recarga de gás 13kg");
    assert.equal(r.itens[1].codigo, "524191567");
  });

  it("célula NUMÉRICA vira string e aponta duplicados no arquivo", () => {
    const aoa = [
      ["Item", "Codigo", "Descricao", "Und"],
      [1, 154386, "ABSORVENTE", "UNIDADE"],
      [2, 154386, "REPETIDO", "UNIDADE"],
    ];
    const r = parseCatalogoFromMatriz(aoa, "dup.xlsx");
    assert.equal(r.itens.length, 2);
    assert.equal(r.itens[0].codigo, "154386");
    assert.equal(r.itens[0].sequencial, 1);
    assert.deepEqual(r.duplicadosNoArquivo, ["154386"]);
  });

  it("sem cabeçalho de tabela → nenhum item", () => {
    const r = parseCatalogoFromMatriz([["Texto solto"], ["sem", "colunas"]], "x.xlsx");
    assert.equal(r.itens.length, 0);
  });
});
