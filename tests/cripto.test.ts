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

describe("cripto com AAD + chave derivada (login da Centi)", async () => {
  const { chaveDerivada, cifrarComAad, decifrarComAad } = await import("../src/lib/cripto.ts");
  it("abre só com o mesmo dono e a mesma chave derivada", async () => {
    const k = await chaveDerivada("mestra", "pca/centi-login/v2");
    const blob = await cifrarComAad(k, "segredo", "centi-login:u1");
    assert.match(blob, /^v2:[0-9a-f]+:[0-9a-f]+$/);
    assert.equal(await decifrarComAad(k, blob, "centi-login:u1"), "segredo");
    assert.equal(await decifrarComAad(k, blob, "centi-login:u2"), null); // copiado para outra pessoa: não abre
    const outra = await chaveDerivada("mestra", "outro-proposito");
    assert.equal(await decifrarComAad(outra, blob, "centi-login:u1"), null); // outro propósito: outra chave
    assert.notDeepEqual(k, await chaveDeSegredo("mestra"));
    assert.equal(await decifrarComAad(k, "lixo", "centi-login:u1"), null);
    assert.equal(await decifrarComAad(k, blob.slice(3), "centi-login:u1"), null); // sem o "v2:"
  });
});
