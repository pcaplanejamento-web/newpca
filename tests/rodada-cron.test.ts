import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_CHAMADAS_RODADA, frotaTrabalhou, registraNaVez, rodadaDoCron, textoTarefas, vezDaRodada } from "../src/lib/rodada-cron-core.ts";

test("rodada: segue enquanto trabalha e para no ocioso", async () => {
  const vezes: number[] = [];
  const r = await rodadaDoCron(async (v) => {
    vezes.push(v);
    return { ok: true, trabalhou: v < 3 };
  });
  assert.deepEqual(vezes, [0, 1, 2, 3]);
  assert.deepEqual(r, { vezes: 4, tarefas: 3 });
});

test("rodada: para no erro, no teto e no tempo", async () => {
  assert.deepEqual(await rodadaDoCron(async () => ({ ok: false, trabalhou: true })), { vezes: 1, tarefas: 0 });
  assert.deepEqual(await rodadaDoCron(async () => ({ ok: true, trabalhou: true })), { vezes: MAX_CHAMADAS_RODADA, tarefas: MAX_CHAMADAS_RODADA });
  let t = 0;
  const r = await rodadaDoCron(
    async () => {
      t += 10_000;
      return { ok: true, trabalhou: true };
    },
    () => t,
  );
  assert.deepEqual(r, { vezes: 3, tarefas: 3 });
});

test("vez da rodada, registro e textos", () => {
  assert.equal(vezDaRodada("https://cron.interno/x?vez=3"), 3);
  assert.equal(vezDaRodada("https://cron.interno/x"), 0);
  assert.equal(vezDaRodada("https://cron.interno/x?vez=-1"), 0);
  assert.equal(vezDaRodada(`https://cron.interno/x?vez=${MAX_CHAMADAS_RODADA}`), 0);
  assert.equal(registraNaVez(0, true), true);
  assert.equal(registraNaVez(2, true), false);
  assert.equal(registraNaVez(2, false), true);
  assert.equal(registraNaVez(MAX_CHAMADAS_RODADA - 1, true), true);
  assert.equal(textoTarefas(0, true), "1 tarefa na rodada");
  assert.equal(textoTarefas(4, false), "4 tarefas na rodada");
  assert.equal(frotaTrabalhou("Lido 000617 combustivel 2026-10-01..2026-10-07: 3 registros (0 novos, 0 alterados)."), true);
  assert.equal(frotaTrabalhou("Período grande demais (x y); o passo diminui."), true);
  assert.equal(frotaTrabalhou("Nada a atualizar agora."), false);
});
