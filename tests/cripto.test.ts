import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chaveDeSegredo, cifrar, decifrar } from "../src/lib/cripto.ts";

describe("cripto (AES-GCM dos segredos de integração)", () => {
  it("round-trip: decifra o que cifrou com a mesma chave", async () => {
    const k = await chaveDeSegredo("chave-mestra-teste");
    const blob = await cifrar(k, "minha-api-key-secreta");
    assert.match(blob, /^[0-9a-f]+:[0-9a-f]+$/); // formato ivHex:ctHex
    assert.equal(await decifrar(k, blob), "minha-api-key-secreta");
  });

  it("IV aleatório: cifrar duas vezes dá blobs diferentes", async () => {
    const k = await chaveDeSegredo("x");
    const a = await cifrar(k, "igual");
    const b = await cifrar(k, "igual");
    assert.notEqual(a, b);
    assert.equal(await decifrar(k, a), "igual");
    assert.equal(await decifrar(k, b), "igual");
  });

  it("chave errada → null (não vaza)", async () => {
    const k1 = await chaveDeSegredo("certa");
    const k2 = await chaveDeSegredo("errada");
    const blob = await cifrar(k1, "segredo");
    assert.equal(await decifrar(k2, blob), null);
  });

  it("blob corrompido/ inválido → null", async () => {
    const k = await chaveDeSegredo("x");
    assert.equal(await decifrar(k, "lixo"), null);
    assert.equal(await decifrar(k, "abcd:ef01"), null);
    assert.equal(await decifrar(k, ""), null);
  });
});
