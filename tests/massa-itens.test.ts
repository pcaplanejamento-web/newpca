import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogoRef } from "../src/lib/catalogo-conferencia.ts";
import {
  descreverAcaoItem,
  fatiarItensPorDfd,
  type ItemMassa,
  planejarMassaItens,
  resumirFalhasItens,
} from "../src/lib/massa-itens.ts";

const it1: ItemMassa = { id: 1, item: 1, codigo: "100", descricao: "CANETA AZUL", unidade: "UN", quantidade: 10, valorUnitario: 2, valorTotal: 20 };
const it2: ItemMassa = { id: 2, item: 2, codigo: "200", descricao: "papel a4 ", unidade: "PCT", quantidade: 5, valorUnitario: 30, valorTotal: 150 };
const it3: ItemMassa = { id: 3, item: 3, codigo: "999", descricao: "ITEM SEM CATÁLOGO", unidade: "CX", quantidade: null, valorUnitario: 7, valorTotal: 7 };
const itens = [it1, it2, it3];
const ref = (codigo: string, descricao: string, unidade: string): CatalogoRef => ({ codigo, codigoRaw: codigo, descricao, unidade, tipos: [], catalogoNome: "Cat" });
const catalogo = new Map<string, CatalogoRef>([
  ["100", ref("100", "CANETA AZUL", "UN")],
  ["200", ref("200", "PAPEL A4 BRANCO", "RESMA")],
]);

describe("planejarMassaItens — mesmas travas da edição item a item", () => {
  it("padronizar pelo catálogo: só o que diverge; fora do catálogo é recusado", () => {
    const p = planejarMassaItens(itens, new Set([1, 2, 3]), { campo: "catalogo" }, catalogo);
    assert.deepEqual(p.atualizar, [{ id: 2, patch: { descricao: "PAPEL A4 BRANCO", unidade: "RESMA" } }]);
    assert.deepEqual(p.recusas, [{ id: 3, item: 3, motivo: "fora do catálogo" }]);
    assert.deepEqual(p.remover, []);
  });

  it("unidade: igual à do catálogo fica TRAVADA; divergente ou fora do catálogo pode", () => {
    const p = planejarMassaItens(itens, new Set([1, 2, 3]), { campo: "unidade", valor: "CX" }, catalogo);
    assert.deepEqual(p.recusas.map((r) => r.id), [1]);
    assert.deepEqual(p.atualizar, [{ id: 2, patch: { unidade: "CX" } }]); // it3 já é CX: nada muda
  });

  it("quantidade/unitário recalculam o total do item (quando os dois existem)", () => {
    const q = planejarMassaItens(itens, new Set([1, 3]), { campo: "quantidade", valor: 4 }, catalogo);
    assert.deepEqual(q.atualizar, [
      { id: 1, patch: { quantidade: 4, valorTotal: 8 } },
      { id: 3, patch: { quantidade: 4, valorTotal: 28 } },
    ]);
    const v = planejarMassaItens(itens, new Set([2, 3]), { campo: "valorUnitario", valor: 1.115 }, catalogo);
    assert.deepEqual(v.atualizar, [
      { id: 2, patch: { valorUnitario: 1.115, valorTotal: 5.58 } },
      { id: 3, patch: { valorUnitario: 1.115, valorTotal: 7 } }, // sem quantidade: mantém o total
    ]);
  });

  it("remover nunca deixa o DFD sem itens", () => {
    assert.deepEqual(planejarMassaItens(itens, new Set([1, 3]), { campo: "remover" }, catalogo).remover, [1, 3]);
    const tudo = planejarMassaItens(itens, new Set([1, 2, 3]), { campo: "remover" }, catalogo);
    assert.deepEqual(tudo.remover, []);
    assert.equal(tudo.recusas.length, 3);
  });

  it("ids que não são do DFD são ignorados", () => {
    const p = planejarMassaItens(itens, new Set([42]), { campo: "quantidade", valor: 1 }, catalogo);
    assert.deepEqual(p, { atualizar: [], remover: [], recusas: [] });
  });
});

describe("planejarMassaItens — trava pela CONTAGEM do DFD (o servidor lê só os itens pedidos)", () => {
  it("remover: recusa só quando os pedidos são TODOS os itens do DFD", () => {
    const soPedidos = [it2];
    // O DFD tem 3 itens e só o 2 foi pedido → remove.
    assert.deepEqual(planejarMassaItens(soPedidos, new Set([2]), { campo: "remover" }, catalogo, 3).remover, [2]);
    // O DFD tem só esse item → recusado (nunca fica sem itens).
    const p = planejarMassaItens(soPedidos, new Set([2]), { campo: "remover" }, catalogo, 1);
    assert.deepEqual(p.remover, []);
    assert.equal(p.recusas[0].motivo, "o DFD ficaria sem itens");
  });
  it("descreverAcaoItem", () => {
    assert.equal(descreverAcaoItem({ campo: "unidade", valor: "UN" }), "unidade → UN");
    assert.equal(descreverAcaoItem({ campo: "remover" }), "removidos");
    assert.equal(descreverAcaoItem({ campo: "quantidade", valor: 1500 }), "quantidade → 1.500");
  });
});

describe("fatiarItensPorDfd / resumirFalhasItens", () => {
  it("fatias de ≤ N DFDs e ≤ M itens, sem separar um DFD que cabe numa fatia", () => {
    const dfdDe = new Map([[1, 10], [2, 10], [3, 20], [4, 30], [5, 30], [6, 40]]);
    assert.deepEqual(fatiarItensPorDfd([1, 2, 3, 4, 5, 6], dfdDe, 2, 100), [[1, 2, 3], [4, 5, 6]]);
    assert.deepEqual(fatiarItensPorDfd([1, 2, 3, 4, 5, 6], dfdDe, 5, 3), [[1, 2, 3], [4, 5, 6]]);
    // DFD maior que a fatia: quebra em partes do máximo.
    assert.deepEqual(fatiarItensPorDfd([1, 2], dfdDe, 5, 1), [[1], [2]]);
    // item desconhecido é ignorado
    assert.deepEqual(fatiarItensPorDfd([99], dfdDe, 5, 10), []);
  });
  it("agrupa pelo motivo e trunca a lista", () => {
    const r = resumirFalhasItens(
      [
        { dfd: "12", item: 4, motivo: "fora do catálogo" },
        { dfd: "12", item: 7, motivo: "fora do catálogo" },
        { dfd: "13", item: null, motivo: "sem acesso" },
      ],
      1,
    );
    assert.deepEqual(r, ["2 itens: fora do catálogo (DFD 12 item 4 … (+1))", "1 item: sem acesso (DFD 13)"]);
  });
});
