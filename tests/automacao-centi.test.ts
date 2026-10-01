import assert from "node:assert/strict";
import { test } from "node:test";
import { CONFIG_CENTI_PADRAO, lerConfigCenti, lerIdsCenti, pedidoEmitirDfd, TRAVAS_CENTI } from "../src/lib/automacao-centi-core.ts";

test("lerIdsCenti: separadores, únicos, sem zeros à esquerda", () => {
  assert.deepEqual(lerIdsCenti("1154:1155, 1154;0160 abc 0").ids, ["1154", "1155", "160"]);
  const muitos = Array.from({ length: 205 }, (_, i) => i + 1).join(":");
  const r = lerIdsCenti(muitos);
  assert.equal(r.ids.length, 200);
  assert.equal(r.excedente, 5);
});

test("lerConfigCenti: inválido volta ao padrão", () => {
  assert.deepEqual(lerConfigCenti(null), CONFIG_CENTI_PADRAO);
  const c = lerConfigCenti({ valorReferencia: false, guid: "x", moduleKey: -1, assinaturaDfd: "a7" });
  assert.equal(c.valorReferencia, false);
  assert.equal(c.guid, CONFIG_CENTI_PADRAO.guid);
  assert.equal(c.moduleKey, CONFIG_CENTI_PADRAO.moduleKey);
  assert.equal(c.assinaturaDfd, "7");
});

test("pedidoEmitirDfd: o Id, as opções e as TRAVAS", () => {
  const p = pedidoEmitirDfd("1154", CONFIG_CENTI_PADRAO, new Date(2026, 9, 1, 11, 57, 45));
  const v = Object.fromEntries(p.Params.map((x) => [x.Key, x.Value]));
  assert.equal(p.ModuleKey, 120464);
  assert.equal(v.IdComprasPlanejamento, "1154");
  assert.equal(v.EmitirValorReferencia, "1");
  assert.equal(v.Data, "01/10/2026");
  assert.equal(v.DataAssinatura, "01/10/2026 11:57:45");
  for (const [k, val] of Object.entries(TRAVAS_CENTI)) assert.equal(v[k], val, k);
  assert.equal(p.Params.length, 44);
});
