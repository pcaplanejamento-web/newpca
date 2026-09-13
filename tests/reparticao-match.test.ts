import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { casarReparticao } from "../src/lib/reparticao-match.ts";

// Auto-match do Setor Requisitante do DFD com a repartição: 1) pela sigla
// (código), 2) fallback pelo nome (ignora acentos/conectores/"MUNICIPAL").

describe("reparticao-match (casarReparticao)", () => {
  const reps = [
    { id: 1, codigo: "SME", nome: "SECRETARIA MUNICIPAL DE EDUCAÇÃO" },
    { id: 2, codigo: "SIR", nome: "Secretaria de Infraestrutura Rural" },
  ];

  it("casa pela SIGLA (código = sigla do setor)", () => {
    assert.equal(casarReparticao({ siglaSetor: "SME", setorRequisitante: "SME - Educação" }, reps), 1);
  });

  it("fallback pelo NOME quando a sigla diverge (SMIR × SIR)", () => {
    const r = casarReparticao(
      { siglaSetor: "SMIR", setorRequisitante: "SMIR - SECRETARIA MUNICIPAL DE INFRAESTRUTURA RURAL" },
      reps,
    );
    assert.equal(r, 2); // casa "Secretaria de Infraestrutura Rural" por chaveNome
  });

  it("nenhum match → null", () => {
    assert.equal(casarReparticao({ siglaSetor: "XYZ", setorRequisitante: "XYZ - Desconhecido" }, reps), null);
  });

  it("sem setor → null", () => {
    assert.equal(casarReparticao({}, reps), null);
  });
});
