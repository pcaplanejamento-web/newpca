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

test("UMA automação × Centi: os modelos antigos saíram; o interno só nasce como etapa; o Substituir é legado", async () => {
  const { REGISTRO_NOS, NOS_POR_CATEGORIA } = await import("../src/lib/fluxo-nos.ts");
  const ids = MODELOS_FLUXO.map((m) => m.id);
  for (const velho of ["conferir-1-dfd", "conferir-dfds-cm002", "dfds-de-protocolo-centi", "substituir-dfds-centi", "corrigir-divergentes-centi", "cm002", "unidades-cm002", "situacao-cm002-coluna"])
    assert.ok(!ids.includes(velho), velho);
  const unica = MODELOS_FLUXO.find((x) => x.id === "conferir-corrigir-centi");
  assert.equal(unica?.nome, "Verificar DFDs na Centi");
  assert.deepEqual(unica?.dependencias, ["conferir-corrigir-1-dfd"]);
  // Todo modelo interno é etapa de algum outro modelo.
  for (const m of MODELOS_FLUXO.filter((x) => x.interno)) assert.ok(MODELOS_FLUXO.some((o) => o.dependencias?.includes(m.id)), m.id);
  // Os dados de entrada da única: quais DFDs e O QUE verificar (só as decisões — paralelo e retomada não).
  const campos = (tipo: string) => (REGISTRO_NOS.get(tipo)?.campos ?? []).filter((c) => c.entrada).map((c) => c.chave);
  assert.ok(campos("sistema.ler").includes("buscaDfds"));
  assert.deepEqual(campos("dados.filtrarConferencia"), ["conteudo", "quais", "corrigir", "situacao", "centro", "trocarUnidade", "semDfd"]);
  assert.deepEqual(campos("fluxo.executar"), []);
  assert.equal(REGISTRO_NOS.get("saida.substituirDfd")?.legado, true);
  assert.ok(!NOS_POR_CATEGORIA.some((c) => c.nos.some((n) => n.tipo === "saida.substituirDfd")), "fora da paleta");
});

test("disparo da Mesa: a ação da coluna Centi vai e volta (e o formato antigo vira “conferir”)", async () => {
  const { gravarDisparoMesa, lerDisparoMesa } = await import("../src/lib/automacao-mesa.ts");
  const guardado = new Map<string, string>();
  const g = globalThis as unknown as { sessionStorage?: unknown; window?: unknown };
  const antes = { s: g.sessionStorage, w: g.window };
  g.sessionStorage = { setItem: (k: string, v: string) => guardado.set(k, v), getItem: (k: string) => guardado.get(k) ?? null, removeItem: (k: string) => guardado.delete(k) };
  g.window = { dispatchEvent: () => true };
  try {
    assert.equal(gravarDisparoMesa({ fluxoId: 3, itens: [{ id: 1 }], acao: "corrigir" }), true);
    assert.deepEqual(lerDisparoMesa(), { fluxoId: 3, itens: [{ id: 1 }], acao: "corrigir" });
    guardado.set("automacao:disparo", JSON.stringify({ fluxoId: 3, itens: [{ id: 1 }], soConferir: true }));
    assert.deepEqual(lerDisparoMesa(), { fluxoId: 3, itens: [{ id: 1 }], acao: "conferir" });
    gravarDisparoMesa({ fluxoId: 3, itens: [{ id: 1 }] });
    assert.deepEqual(lerDisparoMesa(), { fluxoId: 3, itens: [{ id: 1 }] });
    assert.equal(lerDisparoMesa(), null, "roda uma vez só");
  } finally {
    g.sessionStorage = antes.s;
    g.window = antes.w;
  }
});

test("dfdsDoAlvo: protocolos e itens viram os DFDs deles, sem repetir", async () => {
  const { dfdsDoAlvo } = await import("../src/lib/automacao-mesa.ts");
  const dfds = [
    { id: 1, numero: "10", planejamento: "100", protocoloId: 7 },
    { id: 2, numero: "11", planejamento: null, protocoloId: 7 },
    { id: 3, numero: "12", planejamento: "120", protocoloId: null },
  ];
  assert.deepEqual(dfdsDoAlvo(dfds, "protocoloId", new Set([7])), [
    { id: 1, numero: "10", planejamento: "100" },
    { id: 2, numero: "11", planejamento: "" },
  ]);
  assert.deepEqual(dfdsDoAlvo(dfds, "id", new Set([3, 3])).map((d) => d.id), [3]);
  assert.deepEqual(dfdsDoAlvo(dfds, "protocoloId", new Set()), []);
});
