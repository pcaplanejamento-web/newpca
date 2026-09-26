import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ABA_KEYS, ABAS, abasConhecidas, rotaInicial } from "../src/lib/abas.ts";

describe("abas de módulo (permissões)", () => {
  it("a Mesa é o 1º módulo e cada aba tem rota própria", () => {
    assert.deepEqual(ABA_KEYS, ["dfd", "pca", "catalogo", "orcamento", "tarefas", "calendario"]);
    assert.equal(ABAS[0].href, "/painel/mesa");
    assert.equal(new Set(ABAS.map((a) => a.href)).size, ABAS.length);
    assert.deepEqual(
      ABAS.map((a) => a.key),
      [...ABA_KEYS],
    );
  });

  it("abasConhecidas descarta chaves de módulos removidos, repetidas e lixo", () => {
    assert.deepEqual(abasConhecidas(["dashboard", "protocolos", "dfd", "pca", "dfd"]), ["dfd", "pca"]);
    assert.deepEqual(abasConhecidas(["catalogo", 7, null, "", "orcamento"]), ["catalogo", "orcamento"]);
    assert.deepEqual(abasConhecidas("dfd"), []);
    assert.deepEqual(abasConhecidas(null), []);
    assert.deepEqual(abasConhecidas(undefined), []);
    assert.deepEqual(abasConhecidas(["dashboard", "protocolos"]), []);
  });

  it("rotaInicial = a 1ª aba liberada na ordem da navegação; sem nenhuma, o Perfil", () => {
    assert.equal(rotaInicial(new Set(ABA_KEYS)), "/painel/mesa");
    assert.equal(rotaInicial(new Set(["orcamento", "pca"])), "/painel/pca");
    assert.equal(rotaInicial(new Set(["catalogo"])), "/painel/catalogo");
    assert.equal(rotaInicial(new Set(["dashboard", "protocolos"])), "/painel/perfil");
    assert.equal(rotaInicial(new Set()), "/painel/perfil");
  });
});
