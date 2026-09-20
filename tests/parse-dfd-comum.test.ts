import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ehRuido, extrairCabecalho } from "../src/lib/parse-dfd-comum.ts";

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

describe("parse-dfd-comum (ehRuido — não deixa assinatura vazar p/ as seções)", () => {
  it("filtra a APARÊNCIA da assinatura em qualquer variante (digital/eletronica) + marcas Centi/Dropsigner", () => {
    // Se um bloco de assinatura vier ACHATADO no texto da seção, não pode virar conteúdo do DFD.
    assert.equal(ehRuido("Assinado eletronicamente por: WELLINGTON SOARES CARRIJO FILHO CPF: ***.786.871-** Data: 26/06/2026"), true);
    assert.equal(ehRuido("Assinado digitalmente por NATYELLE RAMOS SOARES, portador do CPF: ***.365.888-**"), true);
    assert.equal(ehRuido("Centi ® e-Assinatura: 0pFÇdZ58teX Emitido em 26/06/2026 13:50 por fernanda.mello"), true);
    assert.equal(ehRuido("Documento assinado no Dropsigner. Para validar acesse https://www.dropsigner.com/validate/TL6S2-3YJP7-DXG63-VFGLX."), true);
    // Texto legítimo de seção NÃO é ruído.
    assert.equal(ehRuido("Autorizo o início da formalização da demanda."), false);
    assert.equal(ehRuido("LOCAÇÃO DE IMÓVEL COM A FINALIDADE DE ATENDER O VAPT-VUPT"), false);
  });
});
