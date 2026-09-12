import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type PdfItem, parseDfdFromPdfItems } from "../src/lib/parse-dfd-pdf-core.ts";

// Fixture = trechos de texto com posição (como o pdf.js entrega), modelados nas
// coordenadas reais de DFD PDF.pdf: rótulo e valor em trechos separados, número
// do item na linha do meio, código quebrado em 2 linhas e cabeçalho "VALOR
// UNITÁRIO" em 2 linhas.

const f = (page: number, x: number, y: number, str: string): PdfItem => ({ page, x, y, str });

function dfdPdf(): PdfItem[] {
  return [
    // Cabeçalho do documento
    f(1, 150, 760, "AQUISIÇÃO DE SERVIÇO Número DFD:1586 / Planejamento: 1639"),
    f(1, 150, 748, "Tipo DFD: DFD-S — Solução / com ETP"),
    // Seção 1 (área requisitante) — vira campos, não seção
    f(1, 38, 712, "1 - ÁREA REQUISITANTE DA DEMANDA"),
    f(1, 38, 697, "Órgão/Entidade:"),
    f(1, 94, 697, "PREFEITURA MUNICIPAL DE RIO VERDE"),
    f(1, 38, 683, "Setor Requisitante:"),
    f(1, 104, 683, "SMIR - SECRETARIA MUNICIPAL DE INFRAESTRUTURA RURAL"),
    f(1, 38, 669, "Responsável pela Demanda:"),
    f(1, 135, 669, "CLAUDIO LUIZ DE SOUSA"),
    f(1, 388, 669, "Matrícula:"),
    f(1, 423, 669, "1043055"),
    f(1, 38, 655, "E-mail:"),
    f(1, 63, 655, "claudioluiz99685320@gmail.com"),
    f(1, 388, 655, "Telefone:"),
    f(1, 421, 655, "(64) 99968-5320"),
    // Seção 2
    f(1, 38, 620, "2 - IDENTIFICAÇÃO DA DEMANDA"),
    f(1, 38, 606, "DISPENSA DE LICITAÇÃO PARA CONTRATAÇÃO DE ITENS FRACASSADOS."),
    // Seção 4 — tabela
    f(1, 38, 450, "4 - QUANTIDADE DE MATERIAL/SERVIÇOS A SER CONTRATADA"),
    f(1, 48, 427, "ITEM"),
    f(1, 85, 427, "CÓDIGO"),
    f(1, 206, 427, "DESCRIÇÃO"),
    f(1, 346, 427, "UNIDADE"),
    f(1, 395, 427, "QUANTIDADE"),
    f(1, 507, 427, "VALOR TOTAL"),
    f(1, 458, 423, "UNITÁRIO"),
    // item 1 (número na linha y394, código em y398+y390)
    f(1, 123, 410, "GUINDASTE HIDRAULICO AUTOPROPELIDO (MODELO 1 –"),
    f(1, 123, 402, "MÉDIO PORTE), COM LANÇA TELESCOPICA 28,80 M,"),
    f(1, 82, 398, "524193726"),
    f(1, 55, 394, "1"),
    f(1, 123, 394, "CAPACIDADE MAXIMA 30 T, POTENCIA 97 KW, TRACAO 4 X"),
    f(1, 353, 394, "DIAS"),
    f(1, 419, 394, "56,0000"),
    f(1, 466, 394, "3.256,1200"),
    f(1, 515, 394, "182.342,7200"),
    f(1, 97, 390, "3"),
    f(1, 123, 386, "4. INCLUSO TRANSPORTE. (CARGA/DESCARGA DAS"),
    f(1, 123, 378, "ADUELAS)"),
    // item 2
    f(1, 123, 366, "GUINDASTE HIDRAULICO AUTOPROPELIDO (MODELO 2 –"),
    f(1, 123, 358, "GRANDE PORTE), COM LANÇA TELESCOPICA 50 M,"),
    f(1, 82, 354, "524193726"),
    f(1, 55, 350, "2"),
    f(1, 123, 350, "CAPACIDADE MAXIMA 100 T, POTENCIA 350 KW, TRACAO"),
    f(1, 353, 350, "DIAS"),
    f(1, 419, 350, "20,0000"),
    f(1, 466, 350, "8.000,0000"),
    f(1, 515, 350, "160.000,0000"),
    f(1, 97, 346, "4"),
    f(1, 123, 342, "10 X 6. INCLUSO TRANSPORTE."),
    // total geral + nota
    f(1, 451, 321, "VALOR TOTAL"),
    f(1, 515, 321, "342.342,7200"),
    f(1, 38, 310, "A ESTIMATIVA DO VALOR DA CONTRATAÇÃO É DE R$ 342.342,72, CONFORME EDITAL."),
    // Seções 5 e 7
    f(1, 38, 259, "5 - PREVISÃO DE ENTREGA/EXECUÇÃO"),
    f(1, 38, 245, "A PREVISÃO PARA INÍCIO É JANEIRO/2027."),
    f(1, 38, 224, "7 - FUNDAMENTAÇÃO LEGAL"),
    f(1, 38, 210, "LEI 14.133/2021."),
  ];
}

describe("parse-dfd-pdf-core", () => {
  it("extrai o cabeçalho (rótulos e valores em trechos separados)", () => {
    const d = parseDfdFromPdfItems(dfdPdf(), "DFD PDF.pdf");
    assert.equal(d.numero, "1586");
    assert.equal(d.orgaoEntidade, "PREFEITURA MUNICIPAL DE RIO VERDE");
    assert.equal(d.setorRequisitante, "SMIR - SECRETARIA MUNICIPAL DE INFRAESTRUTURA RURAL");
    assert.equal(d.siglaSetor, "SMIR");
    assert.equal(d.responsavel, "CLAUDIO LUIZ DE SOUSA");
    assert.equal(d.matricula, "1043055");
    assert.equal(d.email, "claudioluiz99685320@gmail.com");
    assert.equal(d.telefone, "(64) 99968-5320");
    assert.equal(d.valorEstimado, 342342.72);
    assert.equal(d.valorTotal, 342342.72);
  });

  it("remonta a tabela: código quebrado em ordem correta + valores por item", () => {
    const d = parseDfdFromPdfItems(dfdPdf(), "x.pdf");
    assert.equal(d.itens.length, 2);
    assert.equal(d.itens[0].item, 1);
    assert.equal(d.itens[0].codigo, "5241937263"); // rejuntado na ordem certa
    assert.equal(d.itens[0].unidade, "DIAS");
    assert.equal(d.itens[0].quantidade, 56);
    assert.equal(d.itens[0].valorUnitario, 3256.12);
    assert.equal(d.itens[0].valorTotal, 182342.72);
    assert.ok(d.itens[0].descricao?.startsWith("GUINDASTE"));
    assert.equal(d.itens[1].codigo, "5241937264");
    assert.equal(d.itens[1].valorTotal, 160000);
  });

  it("coleta as seções 2, 5, 7 (ignora 1 e 4)", () => {
    const d = parseDfdFromPdfItems(dfdPdf(), "x.pdf");
    const nums = d.secoes.map((s) => s.numero);
    assert.deepEqual(nums, [2, 5, 7]);
    assert.ok(d.secoes.find((s) => s.numero === 7)?.texto.includes("14.133"));
  });

  it("lança erro claro quando falta o Número DFD", () => {
    const aoa = dfdPdf().filter((i) => !/Número DFD/.test(i.str));
    assert.throws(() => parseDfdFromPdfItems(aoa, "x.pdf"), /Número DFD/i);
  });
});
