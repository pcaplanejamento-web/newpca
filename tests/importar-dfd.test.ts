import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { enviarDfdEmLotes } from "../src/lib/importar-dfd.ts";

// `fetch` simulado: o `start-dfd` grava; o 2º lote (append) falha com 4xx (não repete); o DELETE do desfazer responde
// conforme o cenário. Registra as chamadas para conferir o que o cliente fez.
type Resposta = { status: number; corpo?: unknown } | "rede";
const original = globalThis.fetch;
function simular(desfazer: Resposta): string[] {
  const chamadas: string[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const m = (init?.method ?? "GET").toUpperCase();
    chamadas.push(`${m} ${String(url)}`);
    const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status });
    if (m === "DELETE") {
      if (desfazer === "rede") throw new TypeError("Failed to fetch");
      return json(desfazer.status, desfazer.corpo ?? { ok: desfazer.status < 300 });
    }
    const corpo = JSON.parse(String(init?.body));
    if (corpo.mode === "start-dfd") return json(200, { ok: true, dfdId: 42 });
    return json(422, { ok: false, error: "Lote recusado." });
  }) as typeof fetch;
  return chamadas;
}
afterEach(() => {
  globalThis.fetch = original;
});

const meta = { numero: "140" } as Parameters<typeof enviarDfdEmLotes>[0];
const itens = Array.from({ length: 450 }, (_, i) => ({ item: i + 1 })) as unknown as Parameters<typeof enviarDfdEmLotes>[1];

describe("enviarDfdEmLotes — tudo-ou-nada por DFD", () => {
  it("DFD novo: o lote falha e o desfazer apaga → devolve o erro do lote (nada ficou gravado)", async () => {
    const chamadas = simular({ status: 200 });
    await assert.rejects(enviarDfdEmLotes(meta, itens), (e: Error) => e.message === "Lote recusado.");
    assert.ok(chamadas.includes("DELETE /api/dfd/42?origem=desfazer"));
  });
  it("DFD novo: o desfazer RECUSADO (ex.: 409) ou sem rede → avisa a gravação INCOMPLETA", async () => {
    simular({ status: 409, corpo: { ok: false, error: "DFD em um PCA não é excluído" } });
    await assert.rejects(enviarDfdEmLotes(meta, itens), /Lote recusado\. — gravação INCOMPLETA \(200 de 450 itens\): reenvie para completar\./);
    simular("rede");
    await assert.rejects(enviarDfdEmLotes(meta, itens), /gravação INCOMPLETA \(200 de 450 itens\)/);
  });
  it("DFD novo que já não existe (404) conta como desfeito", async () => {
    simular({ status: 404, corpo: { ok: false, error: "DFD não encontrado." } });
    await assert.rejects(enviarDfdEmLotes(meta, itens), (e: Error) => e.message === "Lote recusado.");
  });
  it("sobrescrita (`existia`): nunca apaga — avisa a gravação INCOMPLETA", async () => {
    const chamadas = simular({ status: 200 });
    await assert.rejects(enviarDfdEmLotes(meta, itens, undefined, { existia: true }), /gravação INCOMPLETA \(200 de 450 itens\)/);
    assert.ok(!chamadas.some((c) => c.startsWith("DELETE")));
  });
});

describe("enviarDfdEmLotes — lotes pelo tamanho", () => {
  // `fetch` que grava tudo: registra o modo, o início e quantas linhas cada pedido levou.
  function gravar(): { mode: string; desde?: number; n: number }[] {
    const pedidos: { mode: string; desde?: number; n: number }[] = [];
    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
      const c = JSON.parse(String(init?.body));
      pedidos.push({ mode: c.mode, desde: c.desde, n: c.rows.length });
      return new Response(JSON.stringify({ ok: true, dfdId: 7 }), { status: 200 });
    }) as typeof fetch;
    return pedidos;
  }
  const comDescricao = (qtd: number, tamanho: number) =>
    Array.from({ length: qtd }, (_, i) => ({ item: i + 1, descricao: "X".repeat(tamanho) })) as unknown as Parameters<
      typeof enviarDfdEmLotes
    >[1];

  it("descrições longas: o lote fecha antes de passar de ~500 mil caracteres (nenhum pedido pesado)", async () => {
    const pedidos = gravar();
    const progresso: number[] = [];
    await enviarDfdEmLotes(meta, comDescricao(30, 20_000), (enviados) => progresso.push(enviados));
    assert.deepEqual(pedidos, [
      { mode: "start-dfd", desde: undefined, n: 25 },
      { mode: "append-dfd-itens", desde: 25, n: 5 },
    ]);
    assert.deepEqual(progresso, [25, 30]);
  });
  it("descrições curtas: segue em lotes de 200 itens", async () => {
    const pedidos = gravar();
    await enviarDfdEmLotes(meta, comDescricao(450, 40));
    assert.deepEqual(
      pedidos.map((p) => [p.desde ?? 0, p.n]),
      [
        [0, 200],
        [200, 200],
        [400, 50],
      ],
    );
  });
});
