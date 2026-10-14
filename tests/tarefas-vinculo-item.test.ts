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

import { FILTRO_TAREFAS_PADRAO, filtrarTarefas, SEM_SIGLA, siglasDaTarefa } from "../src/lib/tarefas-core.ts";

test("SIGLA da unidade das tarefas: lida dos vínculos e filtrável (inclui 'sem unidade')", () => {
  const base = { envolvidos: [], prioridade: "media" as const, etiquetas: [], prazo: null, concluidaEm: null, ticket: 1 };
  const a = { ...base, titulo: "A", vinculos: [{ sigla: "SEMED" }, { sigla: "SEMED" }, { sigla: "AMMT" }] };
  const b = { ...base, titulo: "B", vinculos: [{ sigla: null }] };
  assert.deepEqual(siglasDaTarefa(a), ["AMMT", "SEMED"]);
  assert.deepEqual(siglasDaTarefa(b), []);
  const ctx = { usuarioId: null, hoje: "2026-10-14" };
  assert.deepEqual(filtrarTarefas([a, b], { ...FILTRO_TAREFAS_PADRAO, siglas: ["AMMT"] }, ctx).map((t) => t.titulo), ["A"]);
  assert.deepEqual(filtrarTarefas([a, b], { ...FILTRO_TAREFAS_PADRAO, siglas: [SEM_SIGLA] }, ctx).map((t) => t.titulo), ["B"]);
});
