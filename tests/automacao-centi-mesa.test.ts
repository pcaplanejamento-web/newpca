import assert from "node:assert/strict";
import { test } from "node:test";
import { automacaoCentiDaMesa } from "../src/lib/automacao-centi-mesa.ts";
import { hostDaAcaoCenti } from "../src/lib/automacao-mesa.ts";
import type { Grafo } from "../src/lib/fluxo-core.ts";

const no = (id: string, tipo: string, config: Record<string, unknown> = {}) => ({ id, tipo, config, x: 0, y: 0 });
const g = (...nos: ReturnType<typeof no>[]): Grafo => ({ v: 1, nos, conexoes: [] }) as unknown as Grafo;

test("automação da Mesa para a Centi: pelo que o diagrama faz, o nome do modelo desempata", () => {
  const um = { id: 1, nome: "Verificar 1 DFD na Centi", grafo: g(no("a", "sistema.completarDfd"), no("b", "saida.marcarConferencia"), no("c", "saida.corrigirPelaCenti")) };
  const minha = { id: 2, nome: "Minha verificação", grafo: g(no("a", "sistema.ler", { objeto: "dfds" }), no("b", "fluxo.executar", { fluxoId: 1 })) };
  const oficial = { id: 3, nome: "Verificar DFDs na Centi", grafo: g(no("a", "sistema.ler", { objeto: "dfds" }), no("b", "fluxo.executar", { fluxoId: 1 })) };
  assert.deepEqual(automacaoCentiDaMesa([um, minha, oficial]), { id: 3, nome: "Verificar DFDs na Centi" }, "o de nome do modelo");
  assert.equal(automacaoCentiDaMesa([um, minha])?.id, 2, "o “1 DFD” sozinho não serve (não lê os DFDs da Mesa)");
  assert.equal(automacaoCentiDaMesa([um]), null);
  const soMarca = { id: 5, nome: "Só marca", grafo: g(no("a", "sistema.ler", { objeto: "dfds" }), no("b", "saida.marcarConferencia")) };
  assert.equal(automacaoCentiDaMesa([soMarca]), null, "sem corrigir: não serve ao Reconferir/Corrigir");
  const desligado = { ...oficial, grafo: g({ ...no("a", "sistema.ler", { objeto: "dfds" }), desativado: true } as never, no("b", "fluxo.executar", { fluxoId: 1 })) };
  assert.equal(automacaoCentiDaMesa([um, desligado]), null);
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
  assert.equal(automacaoCentiDaMesa([fluxo("conferir-corrigir-1-dfd"), unica])?.id, unica.id);
  const subst = { id: 99, nome: "Substituir DFDs pelos dados da Centi", grafo: g(no("a", "sistema.ler", { objeto: "dfds" }), no("b", "saida.marcarConferencia"), no("c", "saida.corrigirPelaCenti"), no("d", "saida.substituirDfd")) };
  assert.equal(automacaoCentiDaMesa([subst]), null);
});

test("Mesa: a ação da coluna Centi vira o host da execução (só o conteúdo)", () => {
  assert.deepEqual(hostDaAcaoCenti("conferir"), { __soConferir: true, __verificacoes: ["conteudo"] });
  assert.deepEqual(hostDaAcaoCenti("corrigir"), { __corrigir: true, __verificacoes: ["conteudo"] });
  assert.deepEqual(hostDaAcaoCenti(), {});
});
