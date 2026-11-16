import assert from "node:assert/strict";
import { test } from "node:test";
import { automacoesCentiDaMesa } from "../src/lib/automacao-centi-mesa.ts";
import type { Grafo } from "../src/lib/fluxo-core.ts";

const no = (id: string, tipo: string, config: Record<string, unknown> = {}) => ({ id, tipo, config, x: 0, y: 0 });
const g = (...nos: ReturnType<typeof no>[]): Grafo => ({ v: 1, nos, conexoes: [] }) as unknown as Grafo;

test("automações da Mesa para a Centi: pelo que o diagrama faz, o nome do modelo desempata", () => {
  const um = { id: 1, nome: "Conferir 1 DFD × Centi", grafo: g(no("a", "sistema.completarDfd"), no("b", "saida.marcarConferencia")) };
  const todos = { id: 2, nome: "Minha conferência", grafo: g(no("a", "sistema.ler", { objeto: "dfds" }), no("b", "fluxo.executar", { fluxoId: 1 })) };
  const oficial = { id: 3, nome: "Conferir DFDs × Centi", grafo: g(no("a", "sistema.ler", { objeto: "dfds" }), no("b", "fluxo.executar", { fluxoId: 1 })) };
  const subst = { id: 4, nome: "Trocar", grafo: g(no("a", "sistema.ler", { objeto: "dfds" }), no("b", "saida.substituirDfd")) };
  const r = automacoesCentiDaMesa([um, todos, oficial, subst]);
  assert.equal(r.conferir?.id, 3, "o de nome do modelo");
  assert.equal(r.substituir?.id, 4);
  assert.equal(automacoesCentiDaMesa([um, todos]).conferir?.id, 2, "o “1 DFD” sozinho não serve (não lê os DFDs da Mesa)");
  assert.deepEqual(automacoesCentiDaMesa([um]), { conferir: null, substituir: null });
  const desligado = { ...subst, grafo: g(no("a", "sistema.ler", { objeto: "dfds" }), { ...no("b", "saida.substituirDfd"), desativado: true } as never) };
  assert.equal(automacoesCentiDaMesa([desligado]).substituir, null);
});

test("Reconferir da Mesa nunca escolhe uma automação que ALTERA o DFD (corrigir/substituir pela Centi)", async () => {
  const { MODELOS_FLUXO, grafoDoModelo } = await import("../src/lib/fluxo-modelos.ts");
  const ids = new Map(MODELOS_FLUXO.map((m, i) => [m.id, i + 1]));
  const fluxo = (id: string) => {
    const m = MODELOS_FLUXO.find((x) => x.id === id);
    if (!m) throw new Error(id);
    return { id: ids.get(id) as number, nome: m.nome, grafo: grafoDoModelo(m, ids) };
  };
  const um = fluxo("conferir-1-dfd");
  const corrigir = fluxo("corrigir-divergentes-centi");
  assert.equal(automacoesCentiDaMesa([um, corrigir]).conferir, null);
  assert.equal(automacoesCentiDaMesa([corrigir, um, fluxo("conferir-dfds-cm002")]).conferir?.id, ids.get("conferir-dfds-cm002"));
});
