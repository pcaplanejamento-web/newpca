import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { codigoDoItem, ehRuido, extrairCabecalho, limparDescricaoItem, numeroDfd } from "../src/lib/parse-dfd-comum.ts";

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

describe("parse-dfd-comum (ehRuido — rodapé pela FORMA, não pelo prefixo)", () => {
  it("rodapé do Centi é ruído; linhas legítimas que COMEÇAM parecido ficam", () => {
    assert.equal(ehRuido("Emitido em 30/06/2026 09:43 por fernanda.mello"), true);
    assert.equal(ehRuido("Emitido por isaac.pires"), true);
    assert.equal(ehRuido("Página 1 de 2"), true);
    // Antes o prefixo derrubava estas linhas (da descrição do item ou de uma seção):
    assert.equal(ehRuido("CENTÍMETROS DE ALTURA E 40 DE LARGURA;"), false);
    assert.equal(ehRuido("CENTIMETRO CÚBICO"), false);
    assert.equal(ehRuido("EMITIDO EM DUAS VIAS, COM RECIBO"), false);
    assert.equal(ehRuido("EMITIDO POR AUTORIDADE COMPETENTE"), false);
    assert.equal(ehRuido("PÁGINAS NUMERADAS SEQUENCIALMENTE"), false);
    // Variantes do rodapé (com ":", "Página 1/2", "Página 2", usuário sem ponto) e linhas legítimas parecidas.
    assert.equal(ehRuido("Emitido em: 30/06/2026 09:43"), true);
    assert.equal(ehRuido("Emitido por admin"), true);
    assert.equal(ehRuido("Página 1/2"), true);
    assert.equal(ehRuido("Página 2"), true);
    assert.equal(ehRuido("EMITIDO EM 2 VIAS"), false);
    assert.equal(ehRuido("PÁGINA 3 DO MANUAL"), false);
  });
});

describe("parse-dfd-comum (captura de item: descrição, código e números)", () => {
  it("limparDescricaoItem: tira marcadores de lista, TAB, NBSP, invisíveis e o marcador da fonte Symbol", () => {
    assert.equal(
      limparDescricaoItem("SUSTENTAÇÃO;\t• DIMENSÕES\u00A0APROX.:\u200B 3840 X 2880 MM; \uF0B7 ALTA ➢ RESOLUÇÃO ▪ E ✓ BRILHO"),
      "SUSTENTAÇÃO; DIMENSÕES APROX.: 3840 X 2880 MM; ALTA RESOLUÇÃO E BRILHO",
    );
    // Símbolos que carregam sentido ficam: m², °, ®, §, →, ±, "·" dentro de palavra.
    assert.equal(limparDescricaoItem("DOTS/M² 40°C INTEL® § 1º ENTRADA → SAÍDA ±5%"), "DOTS/M² 40°C INTEL® § 1º ENTRADA → SAÍDA ±5%");
    assert.equal(limparDescricaoItem("· ITEM A · ITEM B"), "ITEM A ITEM B");
    assert.equal(limparDescricaoItem("•\t•  "), "");
    // Marcador da Wingdings no uso privado (⧫ = U+F074) some; o símbolo de especificação da Symbol fica.
    assert.equal(limparDescricaoItem("\uF074 CADEIRA GIRATÓRIA; \uF0B7 ASSENTO \uF0B3 50 CM"), "CADEIRA GIRATÓRIA; ASSENTO ≥ 50 CM");
    // Símbolos com sentido ficam: ×, ✕, △, "90◦C", "N∙m".
    assert.equal(limparDescricaoItem("CAIXA 30✕40 CM 2×3 △ 90◦C 10 N∙m"), "CAIXA 30✕40 CM 2×3 △ 90◦C 10 N∙m");
    // Idempotente.
    const uma = limparDescricaoItem("A;\t• B");
    assert.equal(limparDescricaoItem(uma), uma);
  });

  it("codigoDoItem: só dígitos, na ordem, ZERO À ESQUERDA preservado (quebra/tab/espaço no meio)", () => {
    assert.equal(codigoDoItem("524194727\t0"), "5241947270");
    assert.equal(codigoDoItem("524194727 0"), "5241947270");
    assert.equal(codigoDoItem("0524194727"), "0524194727");
    assert.equal(codigoDoItem(" 000123\n"), "000123");
    assert.equal(codigoDoItem("524.194.727-0"), "5241947270");
    assert.equal(codigoDoItem("５２４"), "524"); // dígitos de largura total
    assert.equal(codigoDoItem("5241937263 / 5241937264"), "5241937263"); // dois códigos: vale o 1º, nunca fundidos
    assert.equal(codigoDoItem("524194727 (ANTIGO 1234)"), "524194727");
    assert.equal(codigoDoItem("S/C"), null);
    assert.equal(codigoDoItem(""), null);
    assert.equal(codigoDoItem(null), null);
  });

  it("numeroDfd: pt-BR com o MILHAR só de ponto ('1.000' = 1000) e nunca inventa valor", () => {
    assert.equal(numeroDfd("12,0000"), 12);
    assert.equal(numeroDfd("3.635,0400"), 3635.04);
    assert.equal(numeroDfd("182.342,7200"), 182342.72);
    assert.equal(numeroDfd("1.000"), 1000);
    assert.equal(numeroDfd("12.500.000"), 12500000);
    assert.equal(numeroDfd("12.5"), 12.5);
    assert.equal(numeroDfd("0.500"), 0.5);
    assert.equal(numeroDfd("1,234,567"), 1234567); // várias vírgulas = milhar en-US
    assert.equal(numeroDfd("1,234.50"), 1234.5);
    assert.equal(numeroDfd("R$ 1.234,56"), 1234.56);
    assert.equal(numeroDfd("-5,5"), -5.5);
    assert.equal(numeroDfd(" 12,0000\u00A0"), 12);
    assert.equal(numeroDfd(1000), 1000);
    assert.equal(numeroDfd("1 234,56"), 1234.56); // espaço de milhar só com decimais
    assert.equal(numeroDfd("12,0000 MES"), 12); // texto em volta
    assert.equal(numeroDfd("100 M3"), 100); // dígito colado na letra é parte da palavra
    assert.equal(numeroDfd("14.814.814,6944"), 14814814.6944); // valor quebrado em 2 linhas, já juntado
    // DOIS números na célula = ambíguo ⇒ null (nunca "100200" nem "10")
    assert.equal(numeroDfd("100 200"), null);
    assert.equal(numeroDfd("10-20"), null);
    assert.equal(numeroDfd("Página 2 de 3"), null);
    assert.equal(numeroDfd("1.2.3"), null);
    assert.equal(numeroDfd("abc"), null);
    assert.equal(numeroDfd(""), null);
    assert.equal(numeroDfd(null), null);
    assert.equal(numeroDfd(Number.NaN), null);
  });
});
