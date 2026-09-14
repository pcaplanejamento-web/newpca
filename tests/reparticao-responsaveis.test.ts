import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseResponsaveis, serializeResponsaveis } from "../src/lib/reparticao-responsaveis.ts";

describe("reparticao-responsaveis (vários responsáveis)", () => {
  it("parse: null/vazio → []", () => {
    assert.deepEqual(parseResponsaveis(null), []);
    assert.deepEqual(parseResponsaveis(""), []);
    assert.deepEqual(parseResponsaveis("   "), []);
  });

  it("parse: JSON array → nomes (trim, sem vazios nem duplicados)", () => {
    assert.deepEqual(parseResponsaveis('["Ana"," Bia ","Ana",""]'), ["Ana", "Bia"]);
  });

  it("parse: valor ANTIGO (string única) vira 1 elemento", () => {
    assert.deepEqual(parseResponsaveis("Carlos"), ["Carlos"]);
  });

  it("parse: JSON inválido → fallback para a string crua", () => {
    assert.deepEqual(parseResponsaveis("[nao e json"), ["[nao e json"]);
  });

  it("serialize: vazio → null; senão JSON limpo (sem vazios/duplicados)", () => {
    assert.equal(serializeResponsaveis([]), null);
    assert.equal(serializeResponsaveis(["  ", ""]), null);
    assert.equal(serializeResponsaveis([" Ana ", "Bia", "Ana"]), JSON.stringify(["Ana", "Bia"]));
  });

  it("round-trip serialize→parse", () => {
    const s = serializeResponsaveis(["Ana", "Bia", "Cida"]);
    assert.deepEqual(parseResponsaveis(s), ["Ana", "Bia", "Cida"]);
  });
});
