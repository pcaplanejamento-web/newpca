import assert from "node:assert/strict";
import { test } from "node:test";
import { alternarAutomacaoMesa, idsAutomacoesMesa } from "../src/lib/automacao-mesa.ts";
import { MODELOS_FLUXO } from "../src/lib/fluxo-modelos.ts";
import { metaDoDfd } from "../src/lib/importar-dfd.ts";
import type { DfdParseado } from "../src/lib/parse-dfd-comum.ts";

test("automações da Mesa: preferência tolerante e alternar sem repetir", () => {
  assert.deepEqual(idsAutomacoesMesa(null), []);
  assert.deepEqual(idsAutomacoesMesa({ ids: [3, "4", 3, -1, 2.5, "x"] }), [3, 4]);
  assert.deepEqual(alternarAutomacaoMesa([1, 2], 3, true), [1, 2, 3]);
  assert.deepEqual(alternarAutomacaoMesa([1, 2, 3], 2, false), [1, 3]);
  assert.deepEqual(alternarAutomacaoMesa([1, 2], 2, true), [1, 2]);
});

test("metaDoDfd: o cabeçalho do DFD lido + a unidade/PCA/origem de quem grava", () => {
  const d = { numero: "10", planejamento: "1509", tipo: "DFD-S", objeto: "X", itens: [], secoes: [], assinaturas: [], valorTotal: 5 } as unknown as DfdParseado;
  const m = metaDoDfd(d, { anoPca: 2027, reparticaoId: 4, origem: "sobrescrita" });
  assert.equal(m.numero, "10");
  assert.equal(m.planejamento, "1509");
  assert.equal(m.anoPca, 2027);
  assert.equal(m.reparticaoId, 4);
  assert.equal(m.origem, "sobrescrita");
  assert.equal("protocoloId" in m, false); // sem protocolo: o DFD fica no dele
});

test("modelo Substituir DFDs pela Centi: lê o DFD inteiro e substitui", () => {
  const m = MODELOS_FLUXO.find((x) => x.id === "substituir-dfds-centi");
  assert.ok(m);
  const ler = m.grafo.nos.find((n) => n.tipo === "leitura.dfdCenti");
  assert.equal(ler?.config.completo, true);
  assert.ok(m.grafo.nos.some((n) => n.tipo === "saida.substituirDfd"));
});
