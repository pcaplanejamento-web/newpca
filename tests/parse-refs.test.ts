import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { anoPcaDoTexto, extrairRefsDfd, referenciasRenovacao } from "../src/lib/parse-dfd-comum.ts";

describe("anoPcaDoTexto (ano do PCA)", () => {
  it("acha o ano em várias escritas", () => {
    assert.equal(anoPcaDoTexto("REFERE-SE AOS DFD PARA A ELABORAÇÃO DO PCA DE 2027."), 2027);
    assert.equal(anoPcaDoTexto("PCA 2026"), 2026);
    assert.equal(anoPcaDoTexto("PCA/2028"), 2028);
    assert.equal(anoPcaDoTexto("Plano de Contratações Anual de 2025"), 2025);
    assert.equal(anoPcaDoTexto("INCLUSÃO - PCA - 2030"), 2030);
  });
  it("null quando não há ano/PCA", () => {
    assert.equal(anoPcaDoTexto("INCLUSÃO - PCA"), null);
    assert.equal(anoPcaDoTexto("contrato 860/2025"), null); // não menciona PCA
    assert.equal(anoPcaDoTexto(null), null);
    assert.equal(anoPcaDoTexto("ano 1500"), null); // fora da faixa
  });
});

describe("referenciasRenovacao (DFD-R: contrato/ata/licitação)", () => {
  it("contrato", () => {
    assert.equal(referenciasRenovacao("DEMANDA VINCULADA AO CONTRATO Nº 860/2025 (SANTERMED)").contrato, "860/2025");
    assert.equal(referenciasRenovacao("Contrato n° 123.456/2024").contrato, "123.456/2024");
    assert.equal(referenciasRenovacao("CONTRATO 45/2023 vigente").contrato, "45/2023");
  });
  it("ata (de registro de preços) / ARP", () => {
    assert.equal(referenciasRenovacao("ATA DE REGISTRO DE PREÇOS Nº 12/2025").ata, "12/2025");
    assert.equal(referenciasRenovacao("ARP nº 99/2024").ata, "99/2024");
  });
  it("licitação / pregão / concorrência", () => {
    assert.equal(referenciasRenovacao("PREGÃO ELETRÔNICO Nº 55/2024").licitacao, "55/2024");
    assert.equal(referenciasRenovacao("LICITAÇÃO Nº 07/2025").licitacao, "07/2025");
    assert.equal(referenciasRenovacao("PROCESSO LICITATÓRIO 100/2023").licitacao, "100/2023");
  });
  it("sem referência → tudo null", () => {
    const r = referenciasRenovacao("SERVIÇO DE MANUTENÇÃO PREVENTIVA");
    assert.deepEqual(r, { contrato: null, ata: null, licitacao: null });
  });
  it("extrairRefsDfd combina objeto + seções", () => {
    const r = extrairRefsDfd(
      [{ numero: 3, titulo: "JUSTIFICATIVA", texto: "RENOVAÇÃO DO CONTRATO Nº 860/2025 — PCA DE 2027" }],
      "AQUISIÇÃO DE SERVIÇO",
    );
    assert.equal(r.numeroContrato, "860/2025");
    assert.equal(r.anoPca, 2027);
    assert.equal(r.numeroAta, null);
  });
});
