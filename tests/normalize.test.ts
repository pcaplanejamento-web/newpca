import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanUpper,
  limparTexto,
  linhaTemConteudo,
  normClassificacao,
  normUnidadeMedida,
  normalizarLinha,
  parseDataDesejada,
  parseIntBR,
  parseNumberBR,
  stripAccents,
} from "../src/lib/normalize.ts";

describe("normalize", () => {
  it("stripAccents", () => {
    assert.equal(stripAccents("SERVIÇO"), "SERVICO");
    assert.equal(stripAccents("ÁÉÍÓÚÃÕÇ"), "AEIOUAOC");
  });

  it("cleanUpper colapsa espaços, tira pontuação das pontas e caixa alta", () => {
    assert.equal(cleanUpper("  material   de  consumo "), "MATERIAL DE CONSUMO");
    assert.equal(cleanUpper("- item ;"), "ITEM");
    assert.equal(cleanUpper(null), "");
    assert.equal(cleanUpper(123), "123");
  });

  it("limparTexto: tira invisíveis/controles, TAB/NBSP/quebras viram 1 espaço, NFC, marcador de fonte Symbol vira •", () => {
    assert.equal(limparTexto("  PAINEL\tDE\u00A0LED\r\nP3  "), "PAINEL DE LED P3");
    assert.equal(limparTexto("ALTA\u200BRESOLU\u00ADÇÃO\uFEFF"), "ALTARESOLUÇÃO"); // largura zero/hífen suave/BOM
    assert.equal(limparTexto("A\u0000B\u0007C\u009FD\uFFFDE"), "ABCDE"); // controles e U+FFFD
    assert.equal(limparTexto("DESCRIC\u0327A\u0303O"), "DESCRIÇÃO"); // acentos compostos (NFC)
    assert.equal(limparTexto("\uF0B7 ITEM"), "• ITEM"); // uso privado (Symbol/Wingdings)
    assert.equal(limparTexto("A\u0085B\u2028C\u3000D"), "A B C D"); // brancos Unicode
    assert.equal(limparTexto("DOTS/M² 40°C INTEL®"), "DOTS/M² 40°C INTEL®"); // visíveis intactos
    assert.equal(limparTexto(" \u0301ACENTO ÓRFÃO"), "ACENTO ÓRFÃO");
    // Windows-1252 lido como Latin-1: a PONTUAÇÃO volta; letra estrangeira/indefinido some (lixo, não conteúdo).
    assert.equal(limparTexto("10\u009620 \u0093OK\u0094 \u0092S\u0085FIM"), "10–20 “OK” ’S FIM");
    assert.equal(limparTexto("A\u008AB\u009FC\u0081D"), "ABCD");
    // Fonte Symbol sem mapa Unicode: o símbolo de ESPECIFICAÇÃO volta ao real; o código que também é marcador da
    // Wingdings (⧫ ● ■ ❖ ➢ ✓ ▪…) vira "•"; o "µ" só antes de uma unidade.
    assert.equal(limparTexto("220V \uF0B1 10% \uF0B3 1000W 40\uF0B0C \uF057 \uF044T"), "220V ± 10% ≥ 1000W 40°C Ω ΔT");
    assert.equal(limparTexto("10 \uF06Dm 4,7\uF06DF"), "10 µm 4,7µF");
    assert.equal(limparTexto("\uF074 A \uF06D B \uF076 C \uF0D8 D \uF0FC E \uF0A7 F"), "• A • B • C • D • E • F");
    assert.equal(limparTexto(null), "");
    assert.equal(limparTexto(123), "123");
  });

  it("parseNumberBR aceita pt-BR e en", () => {
    assert.equal(parseNumberBR("1.234,56"), 1234.56);
    assert.equal(parseNumberBR("1234.56"), 1234.56);
    assert.equal(parseNumberBR("R$ 1.000,00"), 1000);
    assert.equal(parseNumberBR("1,5"), 1.5);
    assert.equal(parseNumberBR(42), 42);
    assert.equal(parseNumberBR(""), null);
    assert.equal(parseNumberBR(null), null);
    assert.equal(parseNumberBR("abc"), null);
  });

  it("parseIntBR trunca", () => {
    assert.equal(parseIntBR("12,9"), 12);
    assert.equal(parseIntBR("1.234,5"), 1234);
    assert.equal(parseIntBR(null), null);
  });

  it("parseDataDesejada: dd/mm/yyyy, ISO, Date e ano de 2 dígitos", () => {
    assert.deepEqual(parseDataDesejada("11/09/2026"), { iso: "2026-09-11", mes: 9, ano: 2026 });
    assert.deepEqual(parseDataDesejada("2026-09-11"), { iso: "2026-09-11", mes: 9, ano: 2026 });
    assert.deepEqual(parseDataDesejada("05/03/25"), { iso: "2025-03-05", mes: 3, ano: 2025 });
    assert.deepEqual(parseDataDesejada(new Date(2026, 8, 11)), { iso: "2026-09-11", mes: 9, ano: 2026 });
    assert.equal(parseDataDesejada("sem data"), null);
    assert.equal(parseDataDesejada("13/13/2026"), null);
    assert.equal(parseDataDesejada(null), null);
  });

  it("normClassificacao canoniza sinônimos e descarta códigos numéricos", () => {
    assert.equal(normClassificacao("servico"), "SERVIÇO");
    assert.equal(normClassificacao("MATERIAIS DE CONSUMO"), "MATERIAL DE CONSUMO");
    assert.equal(normClassificacao("119"), "NÃO CLASSIFICADO");
    assert.equal(normClassificacao(""), "NÃO CLASSIFICADO");
    assert.equal(normClassificacao("CATEGORIA NOVA"), "CATEGORIA NOVA");
  });

  it("normUnidadeMedida", () => {
    assert.equal(normUnidadeMedida("unid"), "UNIDADE");
    assert.equal(normUnidadeMedida("UN"), "UNIDADE");
    assert.equal(normUnidadeMedida("m2"), "M²");
    assert.equal(normUnidadeMedida("metro quadrado"), "M²");
    assert.equal(normUnidadeMedida(""), "—");
  });

  it("normalizarLinha calcula valorTotal = quantidade × valorReferência", () => {
    const r = normalizarLinha({
      nomeProduto: "Caneta azul",
      quantidade: "10",
      valorReferencia: "2,50",
      unidadeMedida: "unid",
      classificacao: "material de consumo",
      dataDesejada: "11/09/2026",
    });
    assert.equal(r.quantidade, 10);
    assert.equal(r.valorReferencia, 2.5);
    assert.equal(r.valorTotal, 25);
    assert.equal(r.unidadeMedidaNorm, "UNIDADE");
    assert.equal(r.classificacaoNorm, "MATERIAL DE CONSUMO");
    assert.equal(r.dataDesejada, "2026-09-11");
    assert.equal(r.anoDesejado, 2026);
  });

  it("normalizarLinha sem valores → valorTotal null", () => {
    const r = normalizarLinha({ nomeProduto: "X", quantidade: null, valorReferencia: null });
    assert.equal(r.valorTotal, null);
  });

  it("linhaTemConteudo", () => {
    assert.equal(linhaTemConteudo({ nomeProduto: "Algo" }), true);
    assert.equal(linhaTemConteudo({ idProduto: "123" }), true);
    assert.equal(linhaTemConteudo({ nomeProduto: "   ", idProduto: "" }), false);
    assert.equal(linhaTemConteudo({}), false);
  });
});
