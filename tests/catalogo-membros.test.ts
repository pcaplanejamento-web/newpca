import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { comCatalogo, membrosDoItem, resolverRemocao } from "../src/lib/catalogo-membros.ts";

describe("catalogo-membros (item compartilhado)", () => {
  it("membrosDoItem: origem primeiro, sem duplicar", () => {
    assert.deepEqual(membrosDoItem(1, [2, 3]), [1, 2, 3]);
    assert.deepEqual(membrosDoItem(1, [1, 2]), [1, 2]); // origem repetida no extra é ignorada
    assert.deepEqual(membrosDoItem(5, []), [5]);
  });

  it("comCatalogo: adiciona sem duplicar e ignora a origem", () => {
    assert.deepEqual(comCatalogo(1, [], 2), [2]);
    assert.deepEqual(comCatalogo(1, [2], 2), [2]); // já está → idempotente
    assert.deepEqual(comCatalogo(1, [2], 1), [2]); // alvo = origem → nada
    assert.deepEqual(comCatalogo(1, [1, 2], 3), [2, 3]); // normaliza (tira origem) e adiciona
  });

  it("resolverRemocao: extra some, origem reatribui, único → excluir", () => {
    assert.deepEqual(resolverRemocao(1, [2, 3], 2), { origem: 1, extra: [3] }); // remove extra
    assert.deepEqual(resolverRemocao(1, [2, 3], 1), { origem: 2, extra: [3] }); // remove origem → reatribui
    assert.equal(resolverRemocao(1, [], 1), "excluir"); // único catálogo → exclui o item
    assert.deepEqual(resolverRemocao(1, [2], 9), { origem: 1, extra: [2] }); // remover fora → sem efeito
    assert.deepEqual(resolverRemocao(1, [2], 2), { origem: 1, extra: [] }); // fica só na origem
  });
});
