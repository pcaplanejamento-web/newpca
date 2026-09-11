import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fromHex,
  hashSenha,
  iguaisEmTempoConstante,
  toHex,
  verificarSenha,
} from "../src/lib/password.ts";

describe("password (Web Crypto)", () => {
  it("hashSenha gera formato pbkdf2$<iter>$<salt>$<hash> com 100k iterações", async () => {
    const h = await hashSenha("segredo123");
    const [alg, iter, salt, hash] = h.split("$");
    assert.equal(alg, "pbkdf2");
    assert.equal(iter, "100000");
    assert.equal(salt.length, 32); // 16 bytes em hex
    assert.equal(hash.length, 64); // 256 bits em hex
  });

  it("salt aleatório → hashes diferentes para a mesma senha", async () => {
    assert.notEqual(await hashSenha("igual"), await hashSenha("igual"));
  });

  it("verificarSenha: round-trip verdadeiro/falso", async () => {
    const h = await hashSenha("MinhaSenha!");
    assert.equal(await verificarSenha("MinhaSenha!", h), true);
    assert.equal(await verificarSenha("errada", h), false);
  });

  it("verificarSenha rejeita hash malformado", async () => {
    assert.equal(await verificarSenha("x", "lixo"), false);
    assert.equal(await verificarSenha("x", "md5$1$aa$bb"), false);
    assert.equal(await verificarSenha("x", ""), false);
  });

  it("toHex/fromHex são inversos e iguaisEmTempoConstante", () => {
    const bytes = new Uint8Array([0, 15, 16, 255]);
    assert.equal(toHex(bytes), "000f10ff");
    assert.deepEqual(Array.from(fromHex("000f10ff")), [0, 15, 16, 255]);
    assert.equal(iguaisEmTempoConstante("abc", "abc"), true);
    assert.equal(iguaisEmTempoConstante("abc", "abd"), false);
    assert.equal(iguaisEmTempoConstante("abc", "ab"), false);
  });
});
