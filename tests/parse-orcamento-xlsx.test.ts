import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseValorPlanilha, rotuloColunaOrcamento } from "../src/lib/parse-orcamento-comum.ts";
import { parseOrcamentoFromMatriz } from "../src/lib/parse-orcamento-xlsx-core.ts";

describe("parseValorPlanilha (en-US e pt-BR)", () => {
  it("en-US: milhar (vírgula) + decimal (ponto)", () => {
    assert.equal(parseValorPlanilha("5,000,000.00"), 5000000);
    assert.equal(parseValorPlanilha("1,234.56"), 1234.56);
    assert.equal(parseValorPlanilha("0.00"), 0);
    assert.equal(parseValorPlanilha("700,000.00"), 700000);
  });
  it("pt-BR: milhar (ponto) + decimal (vírgula)", () => {
    assert.equal(parseValorPlanilha("5.000.000,00"), 5000000);
    assert.equal(parseValorPlanilha("1.234,56"), 1234.56);
  });
  it("inteiros com um separador (3 dígitos depois = milhar)", () => {
    assert.equal(parseValorPlanilha("1,234"), 1234);
    assert.equal(parseValorPlanilha("5.000"), 5000);
    assert.equal(parseValorPlanilha("1,234,567"), 1234567);
  });
  it("vazio/símbolos/negativo", () => {
    assert.equal(parseValorPlanilha(""), null);
    assert.equal(parseValorPlanilha("   "), null);
    assert.equal(parseValorPlanilha(null), null);
    assert.equal(parseValorPlanilha("R$ 1.500,00"), 1500);
    assert.equal(parseValorPlanilha("1234"), 1234);
    assert.equal(parseValorPlanilha("(1.000,00)"), -1000);
  });
});

describe("rotuloColunaOrcamento", () => {
  it("classifica os cabeçalhos do CUBO (em qualquer acento/espaço)", () => {
    assert.equal(rotuloColunaOrcamento("Órgão "), "orgao");
    assert.equal(rotuloColunaOrcamento("Unidade "), "unidade");
    assert.equal(rotuloColunaOrcamento("Nome Elemento "), "nomeElemento");
    assert.equal(rotuloColunaOrcamento("Codigo Elemento "), "codigoElemento");
    assert.equal(rotuloColunaOrcamento("Valor emenda impositiva "), "emenda");
    assert.equal(rotuloColunaOrcamento("Valor Inicial "), "inicial");
    assert.equal(rotuloColunaOrcamento("Valor Suplementação "), "suplementacao");
    assert.equal(rotuloColunaOrcamento("Valor Empenho "), "empenho");
    assert.equal(rotuloColunaOrcamento("Saldo "), "saldo");
    assert.equal(rotuloColunaOrcamento("Valor Anulação "), "anulacao");
    assert.equal(rotuloColunaOrcamento("Função "), "funcao");
    assert.equal(rotuloColunaOrcamento("Programa "), "programa");
    assert.equal(rotuloColunaOrcamento("Ação "), "acao");
    assert.equal(rotuloColunaOrcamento("Ficha "), "ficha");
    assert.equal(rotuloColunaOrcamento("Fonte "), "fonte");
    assert.equal(rotuloColunaOrcamento("Coluna qualquer"), null);
  });
});

describe("parseOrcamentoFromMatriz", () => {
  // Espelha o CUBO: título (0-1), cabeçalho por POSIÇÃO com colunas espaçadas (mescladas =
  // vazias), 2 lançamentos, uma linha em branco e o rodapé "Qtd. total".
  const matriz: unknown[][] = [
    ["", "", "", "", "PREFEITURA MUNICIPAL DE RIO VERDE"],
    [""],
    ["Órgão", "", "Unidade", "", "", "Nome Elemento", "Codigo Elemento", "Valor emenda impositiva", "Valor Inicial", "", "", "Valor Suplementação", "", "Valor Empenho", "Saldo", "Valor Anulação"],
    ["FUNDO A", "", "2 - SEC EDU", "", "", "OUTROS SERVIÇOS", "3.3.90.39.00", "0.00", "5,000,000.00", "", "", "0.00", "", "0.00", "5,000,000.00", "0.00"],
    ["PREFEITURA", "", "63 - TURISMO", "", "", "OBRAS", "4.4.90.51.00", "0.00", "700,000.00", "", "", "0.00", "", "0.00", "700,000.00", "0.00"],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Qtd. total 2", "", "", "", ""],
    [""],
  ];

  it("acha o cabeçalho por posição, lê os lançamentos e ignora título/rodapé/branco", () => {
    const r = parseOrcamentoFromMatriz(matriz, "CUBO.XLSX");
    assert.equal(r.itens.length, 2);
    assert.equal(r.nome, "CUBO");
    const a = r.itens[0];
    assert.equal(a.orgao, "FUNDO A");
    assert.equal(a.unidade, "2 - SEC EDU");
    assert.equal(a.nomeElemento, "OUTROS SERVIÇOS");
    assert.equal(a.codigoElemento, "3.3.90.39.00");
    assert.equal(a.valorInicial, 5000000);
    assert.equal(a.saldo, 5000000);
    assert.equal(a.valorEmendaImpositiva, 0);
    assert.equal(a.sequencial, 0);
    assert.equal(r.itens[1].valorInicial, 700000);
    assert.equal(r.itens[1].sequencial, 1);
    assert.equal(r.total, 5700000);
  });

  it("formato antigo (sem Função/Programa/Ação/Ficha/Fonte) → colunas novas vazias", () => {
    const a = parseOrcamentoFromMatriz(matriz, "CUBO.XLSX").itens[0];
    assert.equal(a.funcao, "");
    assert.equal(a.programa, "");
    assert.equal(a.acao, "");
    assert.equal(a.ficha, "");
    assert.equal(a.fonte, "");
  });

  it("NOVO padrão do CUBO: Função · Programa · Ação · Ficha · Fonte (colunas mescladas vazias no meio)", () => {
    // Espelha o CUBO real: Unidade ocupa 3 colunas, Programa 2 e Fonte 2 (mescladas → vazias).
    const novo: unknown[][] = [
      ["", "", "", "", "", "", "ESTADO DE GOIÁS"],
      [""],
      ["Órgão ", "Unidade ", "", "", "Função ", "Programa ", "", "Ação ", "Nome Elemento ", "Codigo Elemento ", "Ficha ", "Valor emenda impositiva ", "Valor Inicial ", "Fonte ", "", "Valor Suplementação ", "Valor Empenho ", "Saldo ", "Valor Anulação "],
      ["FD. MUN. DE ASS. SOCIAL ALTAIR COELHO DE LIMA", "26 - FMACL", "", "", "08 - ASSITENCIA SOCIAL", "6151 - PROGRAMA ASSISTÊNCIA SOCIAL PRESENTE", "", "2191 - MANTER AS ATIVIDADES DA FMACL", "CONTRATAÇÃO POR TEMPO DETERMINADO", "3.1.90.04.00", "0624", "0.00", "5,000.00", "100 - RECURSOS ORDINÁRIOS", "", "0.00", "0.00", "5,000.00", "0.00"],
      ["Qtd. total 1", "", ""],
    ];
    const r = parseOrcamentoFromMatriz(novo, "CUBO.XLSX");
    assert.equal(r.itens.length, 1);
    const a = r.itens[0];
    assert.equal(a.unidade, "26 - FMACL");
    assert.equal(a.funcao, "08 - ASSITENCIA SOCIAL");
    assert.equal(a.programa, "6151 - PROGRAMA ASSISTÊNCIA SOCIAL PRESENTE");
    assert.equal(a.acao, "2191 - MANTER AS ATIVIDADES DA FMACL");
    assert.equal(a.ficha, "0624"); // zero à esquerda preservado (texto)
    assert.equal(a.fonte, "100 - RECURSOS ORDINÁRIOS");
    assert.equal(a.nomeElemento, "CONTRATAÇÃO POR TEMPO DETERMINADO");
    assert.equal(a.codigoElemento, "3.1.90.04.00");
    assert.equal(a.valorInicial, 5000);
    assert.equal(a.saldo, 5000);
    assert.equal(r.total, 5000);
  });

  it("matriz sem cabeçalho → vazio", () => {
    const r = parseOrcamentoFromMatriz(
      [
        ["a", "b"],
        ["c", "d"],
      ],
      "x.xlsx",
    );
    assert.equal(r.itens.length, 0);
    assert.equal(r.total, 0);
  });
});
