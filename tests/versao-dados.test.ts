import assert from "node:assert/strict";
import { test } from "node:test";
import { criarMemoVersao } from "../src/lib/memo-versao-core.ts";

const relogio = () => {
  let t = 0;
  return { agora: () => t, andar: (ms: number) => (t += ms) };
};

test("memo: mesma versão reusa; versão nova recarrega", async () => {
  const r = relogio();
  const m = criarMemoVersao({ max: 10, ttlMs: 1000, agora: r.agora });
  let n = 0;
  const carregar = async () => ++n;
  assert.equal(await m.obter("a", "v1", carregar), 1);
  assert.equal(await m.obter("a", "v1", carregar), 1);
  assert.equal(await m.obter("a", "v2", carregar), 2);
  assert.equal(await m.obter("b", "v2", carregar), 3);
});

test("memo: validade de segurança refaz a carga", async () => {
  const r = relogio();
  const m = criarMemoVersao({ max: 10, ttlMs: 1000, agora: r.agora });
  let n = 0;
  const carregar = async () => ++n;
  await m.obter("a", "v", carregar);
  r.andar(999);
  assert.equal(await m.obter("a", "v", carregar), 1);
  r.andar(1);
  assert.equal(await m.obter("a", "v", carregar), 2);
});

test("memo: visitas simultâneas fazem UMA carga", async () => {
  const m = criarMemoVersao({ max: 10, ttlMs: 1000, agora: () => 0 });
  let n = 0;
  const carregar = () => new Promise<number>((ok) => setTimeout(() => ok(++n), 5));
  const [a, b] = await Promise.all([m.obter("a", "v", carregar), m.obter("a", "v", carregar)]);
  assert.equal(a, 1);
  assert.equal(b, 1);
  assert.equal(n, 1);
});

test("memo: falha não fica guardada", async () => {
  const m = criarMemoVersao({ max: 10, ttlMs: 1000, agora: () => 0 });
  await assert.rejects(m.obter("a", "v", async () => Promise.reject(new Error("x"))));
  await new Promise((ok) => setTimeout(ok, 0));
  assert.equal(m.tamanho(), 0);
  assert.equal(await m.obter("a", "v", async () => 7), 7);
});

test("memo: tamanho limitado — sai a menos usada", async () => {
  const m = criarMemoVersao({ max: 2, ttlMs: 1000, agora: () => 0 });
  let n = 0;
  const carregar = async () => ++n;
  await m.obter("a", "v", carregar);
  await m.obter("b", "v", carregar);
  await m.obter("a", "v", carregar); // "a" usada agora
  await m.obter("c", "v", carregar); // sai "b"
  assert.equal(m.tamanho(), 2);
  assert.equal(await m.obter("a", "v", carregar), 1);
  assert.equal(await m.obter("b", "v", carregar), 4);
});
