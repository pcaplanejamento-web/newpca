import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { itensDoTexto, itensParaTexto } from "../src/lib/itens-dash-texto.ts";
import type { ItemRow } from "../src/lib/queries.ts";

const base: ItemRow = {
  id: 1,
  idProduto: "5241947270",
  sequencial: 1,
  nomeProduto: "CADEIRA",
  unidadeMedida: "UNIDADE",
  quantidade: 10,
  valorReferencia: 12.5,
  valorTotal: 125,
  classificacao: "DFD-S",
  dataDesejada: "2027-03-01",
  codigo: "SME",
  municipio: "DFD 10",
  dfdId: 7,
  dfdNumero: "10",
  protocoloNumero: "144756/2026",
  itemNumero: 1,
  ano: 2027,
  mes: 3,
  anual: false,
  prioridade: "ALTA",
};

describe("itens do Dashboard em texto compacto", () => {
  it("ida e volta: os mesmos itens (nulos, anual, prioridade)", () => {
    const itens: ItemRow[] = [
      base,
      { ...base, id: 2, nomeProduto: null, quantidade: null, valorTotal: null, mes: null, anual: true, periodo: "SEMESTRAL", prioridade: null, dataDesejada: null },
    ];
    assert.deepEqual(itensDoTexto(itensParaTexto(itens)), itens);
  });

  it("fonte lista: sem os campos do DFD (ausentes continuam ausentes)", () => {
    const lista: ItemRow[] = [
      { id: 3, idProduto: null, sequencial: 2, nomeProduto: "X", unidadeMedida: null, quantidade: 1, valorReferencia: null, valorTotal: 5, classificacao: null, dataDesejada: null, codigo: "U1", municipio: "Rio Verde" },
    ];
    const volta = itensDoTexto(itensParaTexto(lista));
    assert.deepEqual(volta, lista);
    assert.equal("dfdId" in volta[0], false);
  });

  it("lista vazia e o formato antigo (lista de objetos) também são lidos", () => {
    assert.deepEqual(itensDoTexto(itensParaTexto([])), []);
    assert.deepEqual(itensDoTexto(JSON.stringify([base])), [base]);
  });

  it("20 mil itens: o texto compacto é bem menor que a lista de objetos", () => {
    const muitos = Array.from({ length: 20_000 }, (_, k) => ({ ...base, id: k, valorTotal: k * 1.5, nomeProduto: `ITEM ${k}` }));
    const compacto = itensParaTexto(muitos);
    const antigo = JSON.stringify(muitos);
    assert.ok(compacto.length < antigo.length * 0.6, `${compacto.length} × ${antigo.length}`);
    assert.equal(itensDoTexto(compacto).length, 20_000);
  });
});
