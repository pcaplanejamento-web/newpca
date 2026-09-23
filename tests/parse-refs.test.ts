import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { anoPcaDoTexto, extrairRefsDfd, juntarRefs, listaRefs, referenciasRenovacao } from "../src/lib/parse-dfd-comum.ts";

describe("anoPcaDoTexto (ano do PCA)", () => {
  it("acha o ano em várias escritas", () => {
    assert.equal(anoPcaDoTexto("REFERE-SE AOS DFD PARA A ELABORAÇÃO DO PCA DE 2027."), 2027);
    assert.equal(anoPcaDoTexto("PCA 2026"), 2026);
    assert.equal(anoPcaDoTexto("PCA/2028"), 2028);
    assert.equal(anoPcaDoTexto("Plano de Contratações Anual de 2025"), 2025);
    assert.equal(anoPcaDoTexto("INCLUSÃO - PCA - 2030"), 2030);
    // "PCA DO ANO DE 2027" (observação da capa) — o ano pode até quebrar de linha.
    assert.equal(anoPcaDoTexto("INCLUSÃO DAS DEMANDAS NO PCA DO ANO DE 2027."), 2027);
    assert.equal(anoPcaDoTexto("...NO PCA DO ANO DE \n 2027."), 2027);
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

describe("VÁRIAS referências por DFD-R (contratos/ARPs/licitações)", () => {
  it("todas as menções e os itens de uma lista, juntos por '; '", () => {
    assert.equal(referenciasRenovacao("RENOVAÇÃO DOS CONTRATOS Nº 860/2025, 861/2025 E Nº 3/2026 (LOTES 1 A 3)").contrato, "860/2025; 861/2025; 3/2026");
    const r = referenciasRenovacao("CONTRATO Nº 10/2024 e também o CONTRATO Nº 11/2024 e a ATA DE REGISTRO DE PREÇOS Nº 12/2025; ARP nº 99/2024");
    assert.equal(r.contrato, "10/2024; 11/2024");
    assert.equal(r.ata, "12/2025; 99/2024");
    assert.equal(referenciasRenovacao("PREGÕES ELETRÔNICOS Nº 55/2024 E 56/2024 e CONCORRÊNCIA 7/2023").licitacao, "55/2024; 56/2024; 7/2023");
  });
  it("não confunde números de outro formato na lista (ex.: prazo) com referência", () => {
    assert.equal(referenciasRenovacao("CONTRATO Nº 860/2025, 12 MESES DE VIGÊNCIA").contrato, "860/2025");
    assert.equal(referenciasRenovacao("CONTRATO 45 VIGENTE, 30 DIAS").contrato, "45");
  });
  it("nº solto de OUTRA menção (prazo, ano) e DATAS nunca viram referência", () => {
    assert.equal(referenciasRenovacao("RENOVAÇÃO DO CONTRATO Nº 860/2025. PRORROGAÇÃO DO CONTRATO POR 12 MESES.").contrato, "860/2025");
    assert.equal(referenciasRenovacao("RENOVAÇÃO DO CONTRATO Nº 860/2025 — VIGÊNCIA DO CONTRATO DE 12 MESES").contrato, "860/2025");
    assert.equal(referenciasRenovacao("ARP Nº 12/2025. A ATA DE 2024 FOI ASSINADA.").ata, "12/2025");
    assert.equal(referenciasRenovacao("PREGÃO ELETRÔNICO Nº 55/2024. NOVA LICITAÇÃO EM 2026.").licitacao, "55/2024");
    assert.equal(referenciasRenovacao("CONTRATO Nº 860/2025, 01/03/2025").contrato, "860/2025");
    // Sem nenhum nº/ano, vale só a 1ª menção (como antes).
    assert.equal(referenciasRenovacao("CONTRATO 45 VIGENTE. PRORROGAÇÃO DO CONTRATO POR 12 MESES.").contrato, "45");
  });
  it("mesma referência citada duas vezes entra uma vez", () => {
    assert.equal(referenciasRenovacao("CONTRATO Nº 860/2025 ... conforme o CONTRATO 860/2025").contrato, "860/2025");
  });
  it("listaRefs/juntarRefs: lista ⇄ texto do campo, sem vazios nem repetidos", () => {
    assert.deepEqual(listaRefs("860/2025; 861/2025, 860/2025 ;  ; 3/2026"), ["860/2025", "861/2025", "3/2026"]);
    assert.deepEqual(listaRefs(null), []);
    assert.equal(juntarRefs(["860/2025", null, " 861/2025 ", "860/2025"]), "860/2025; 861/2025");
    assert.equal(juntarRefs([]), null);
    assert.equal(juntarRefs(["", "  "]), null);
  });
});
