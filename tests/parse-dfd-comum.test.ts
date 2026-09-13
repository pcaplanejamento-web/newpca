import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extrairCabecalho } from "../src/lib/parse-dfd-comum.ts";

// Lógica de cabeçalho compartilhada entre .xlsx e .pdf (e entre o import de DFD e
// o de PROTOCOLO). Foco: extração dos campos do cabeçalho a partir das "linhas".

describe("parse-dfd-comum (extrairCabecalho)", () => {
  it("não vaza o rótulo 'Data:' para dentro do Setor Requisitante", () => {
    // No PDF real, Setor e Data caem na MESMA linha reconstruída.
    const cab = extrairCabecalho([
      "AQUISIÇÃO DE MATERIAL Número DFD: 944",
      "Setor Requisitante: SECRETARIA MUNICIPAL DE CULTURA Data: 31/08/2026",
    ]);
    assert.equal(cab.setorRequisitante, "SECRETARIA MUNICIPAL DE CULTURA");
    assert.equal(cab.numero, "944");
  });

  it("preserva o setor com sigla (sem 'Data:') e deriva a siglaSetor", () => {
    const cab = extrairCabecalho([
      "Número DFD: 1586",
      "Setor Requisitante: SMIR - SECRETARIA MUNICIPAL DE INFRAESTRUTURA RURAL",
    ]);
    assert.equal(cab.setorRequisitante, "SMIR - SECRETARIA MUNICIPAL DE INFRAESTRUTURA RURAL");
    assert.equal(cab.siglaSetor, "SMIR");
  });
});
