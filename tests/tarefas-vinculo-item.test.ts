import assert from "node:assert/strict";
import { test } from "node:test";
import { hrefVinculo, idVinculoItem, itemDoVinculo, lerVinculo } from "../src/lib/tarefas-core.ts";

test("vínculo de ITEM: DFD + nº do item, estável e de ida e volta", () => {
  const a = idVinculoItem(1234, 7);
  assert.equal(a, 1234000007);
  assert.deepEqual(itemDoVinculo(a), { dfdId: 1234, item: 7 });
  assert.deepEqual(lerVinculo(`item:${a}`), { tipo: "item", id: a });
  assert.equal(hrefVinculo({ tipo: "item", id: a }), "/painel/mesa?abrir=dfd:1234");
  assert.deepEqual(itemDoVinculo(idVinculoItem(999999, 999999)), { dfdId: 999999, item: 999999 });
});
