import assert from "node:assert/strict";
import { test } from "node:test";
import { aApagar, chaveDado, entradaVale, FORMATO_DADOS, MAX_ENTRADAS, sessaoEncerrada, VALIDADE_SEM_USO_MS } from "../src/lib/dados-cliente-core.ts";

const esc = { pessoa: 7, assinatura: "abc" };

test("a chave separa pessoa, escopo, recurso e endereço", () => {
  const k = chaveDado(esc, "empenhos", "/api/empenhos?ano=2026");
  assert.notEqual(k, chaveDado({ pessoa: 8, assinatura: "abc" }, "empenhos", "/api/empenhos?ano=2026"));
  assert.notEqual(k, chaveDado({ pessoa: 7, assinatura: "xyz" }, "empenhos", "/api/empenhos?ano=2026"));
  assert.notEqual(k, chaveDado(esc, "liquidacoes", "/api/empenhos?ano=2026"));
  assert.notEqual(k, chaveDado(esc, "empenhos", "/api/empenhos?ano=2025"));
});

test("a entrada só vale com a mesma chave, pessoa, versão e formato", () => {
  const chave = chaveDado(esc, "r", "/u");
  const e = { chave, pessoa: 7, formato: FORMATO_DADOS, versao: "v1", valor: [1], em: 0, uso: 0 };
  assert.equal(entradaVale(e, chave, esc, "v1"), true);
  assert.equal(entradaVale(e, chave, esc, "v2"), false);
  assert.equal(entradaVale(e, chave, esc, ""), false);
  assert.equal(entradaVale({ ...e, pessoa: 8 }, chave, esc, "v1"), false);
  assert.equal(entradaVale({ ...e, formato: FORMATO_DADOS + 1 }, chave, esc, "v1"), false);
  assert.equal(entradaVale({ ...e, chave: "outra" }, chave, esc, "v1"), false);
  assert.equal(entradaVale(null, chave, esc, "v1"), false);
  assert.equal(entradaVale({ chave, pessoa: 7, formato: FORMATO_DADOS, versao: "v1" }, chave, esc, "v1"), false);
});

test("a limpeza tira outra pessoa, formato antigo, sem uso e o excesso", () => {
  const agora = 10 ** 12;
  const ent = [
    { chave: "a", pessoa: 7, formato: FORMATO_DADOS, uso: agora },
    { chave: "b", pessoa: 8, formato: FORMATO_DADOS, uso: agora },
    { chave: "c", pessoa: 7, formato: 0, uso: agora },
    { chave: "d", pessoa: 7, formato: FORMATO_DADOS, uso: agora - VALIDADE_SEM_USO_MS - 1 },
  ];
  assert.deepEqual(aApagar(ent, 7, agora).sort(), ["b", "c", "d"]);
  const muitas = Array.from({ length: MAX_ENTRADAS + 5 }, (_, i) => ({ chave: `k${i}`, pessoa: 7, formato: FORMATO_DADOS, uso: agora - i }));
  assert.deepEqual(aApagar(muitas, 7, agora), ["k120", "k121", "k122", "k123", "k124"]);
});

test("sessão encerrada", () => {
  assert.equal(sessaoEncerrada(401), true);
  assert.equal(sessaoEncerrada(403), false);
  assert.equal(sessaoEncerrada(200), false);
});

test("resumoTexto: estável, curto e muda com o texto", async () => {
  const { resumoTexto } = await import("../src/lib/dados-cliente-core.ts");
  assert.equal(resumoTexto("1|a,2|b"), resumoTexto("1|a,2|b"));
  assert.notEqual(resumoTexto("1|a,2|b"), resumoTexto("1|a,2|c"));
  assert.ok(resumoTexto("x".repeat(100000)).length < 16);
});
