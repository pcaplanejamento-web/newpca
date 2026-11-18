import assert from "node:assert/strict";
import { test } from "node:test";
import { automacoesCentiDaMesa } from "../src/lib/automacao-centi-mesa.ts";
import type { Grafo } from "../src/lib/fluxo-core.ts";

const no = (id: string, tipo: string, config: Record<string, unknown> = {}) => ({ id, tipo, config, x: 0, y: 0 });
const g = (...nos: ReturnType<typeof no>[]): Grafo => ({ v: 1, nos, conexoes: [] }) as unknown as Grafo;

test("automações da Mesa para a Centi: pelo que o diagrama faz, o nome do modelo desempata", () => {
  const um = { id: 1, nome: "Conferir e corrigir 1 DFD × Centi", grafo: g(no("a", "sistema.completarDfd"), no("b", "saida.marcarConferencia"), no("c", "saida.corrigirPelaCenti")) };
  const minha = { id: 2, nome: "Minha conferência", grafo: g(no("a", "sistema.ler", { objeto: "dfds" }), no("b", "fluxo.executar", { fluxoId: 1 })) };
  const oficial = { id: 3, nome: "Conferir e corrigir DFDs × Centi", grafo: g(no("a", "sistema.ler", { objeto: "dfds" }), no("b", "fluxo.executar", { fluxoId: 1 })) };
  const r = automacoesCentiDaMesa([um, minha, oficial]);
  assert.equal(r.conferir?.id, 3, "o de nome do modelo");
  assert.equal(r.corrigir?.id, 3, "a MESMA automação reconfere (só conferir) e corrige");
  assert.equal(automacoesCentiDaMesa([um, minha]).conferir?.id, 2, "o “1 DFD” sozinho não serve (não lê os DFDs da Mesa)");
  assert.deepEqual(automacoesCentiDaMesa([um]), { conferir: null, corrigir: null });
  const soMarca = { id: 5, nome: "Só marca", grafo: g(no("a", "sistema.ler", { objeto: "dfds" }), no("b", "saida.marcarConferencia")) };
  assert.deepEqual(automacoesCentiDaMesa([soMarca]), { conferir: { id: 5, nome: "Só marca" }, corrigir: null }, "só marca: reconfere, não corrige");
  const desligado = { ...oficial, grafo: g({ ...no("a", "sistema.ler", { objeto: "dfds" }), desativado: true } as never, no("b", "fluxo.executar", { fluxoId: 1 })) };
  assert.deepEqual(automacoesCentiDaMesa([um, desligado]), { conferir: null, corrigir: null });
});

test("Mesa: o Substituir (legado) nunca é escolhido; o modelo único serve às duas ações", async () => {
  const { MODELOS_FLUXO, grafoDoModelo } = await import("../src/lib/fluxo-modelos.ts");
  const ids = new Map(MODELOS_FLUXO.map((m, i) => [m.id, i + 1]));
  const fluxo = (id: string) => {
    const m = MODELOS_FLUXO.find((x) => x.id === id);
    if (!m) throw new Error(id);
    return { id: ids.get(id) as number, nome: m.nome, grafo: grafoDoModelo(m, ids) };
  };
  const unica = fluxo("conferir-corrigir-centi");
  const r = automacoesCentiDaMesa([fluxo("conferir-corrigir-1-dfd"), unica]);
  assert.equal(r.conferir?.id, unica.id);
  assert.equal(r.corrigir?.id, unica.id);
  const subst = { id: 99, nome: "Substituir DFDs pelos dados da Centi", grafo: g(no("a", "sistema.ler", { objeto: "dfds" }), no("b", "saida.marcarConferencia"), no("c", "saida.substituirDfd")) };
  assert.deepEqual(automacoesCentiDaMesa([subst]), { conferir: null, corrigir: null });
});
