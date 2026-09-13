import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PdfItem } from "../src/lib/parse-dfd-pdf-core.ts";
import { parseProtocoloFromPdfItems } from "../src/lib/parse-protocolo-pdf-core.ts";

// Fixture = trechos posicionados (como o pdf.js entrega) de um PROTOCOLO:
// p1 = CAPA DO PROCESSO; p2-3 = DFD 100 (multi-página, mesmo número → 1 DFD);
// p4 = separador (sem Número DFD); p5 = DFD 200; p6 = separador; p7 = DFD 300
// MALFORMADO (tem Número DFD mas sem tabela → erro ISOLADO, não derruba os outros).

const f = (page: number, x: number, y: number, str: string): PdfItem => ({ page, x, y, str });

/** Um DFD válido e compacto numa página (cabeçalho + tabela com 1 item). */
function dfdNaPagina(page: number, numero: string): PdfItem[] {
  return [
    f(page, 150, 760, `AQUISIÇÃO Número DFD:${numero} / Planejamento: 1`),
    f(page, 38, 700, "1 - ÁREA REQUISITANTE DA DEMANDA"),
    f(page, 38, 686, "Setor Requisitante:"),
    f(page, 104, 686, "SME - SECRETARIA MUNICIPAL DE EDUCAÇÃO"),
    f(page, 48, 450, "ITEM"),
    f(page, 85, 450, "CÓDIGO"),
    f(page, 206, 450, "DESCRIÇÃO"),
    f(page, 346, 450, "UNIDADE"),
    f(page, 395, 450, "QUANTIDADE"),
    f(page, 458, 450, "UNITÁRIO"),
    f(page, 507, 450, "VALOR TOTAL"),
    f(page, 55, 430, "1"),
    f(page, 82, 430, "999"),
    f(page, 123, 430, "PRODUTO EXEMPLO"),
    f(page, 353, 430, "UN"),
    f(page, 419, 430, "2,0000"),
    f(page, 466, 430, "10,0000"),
    f(page, 515, 430, "20,0000"),
  ];
}

function protocoloPdf(): PdfItem[] {
  return [
    // p1 = capa
    f(1, 100, 800, "CAPA DO PROCESSO 12345/2026"),
    f(1, 38, 780, "Número Processo: 12345/2026 Data /Hora: Id: 999 01/02/2026 10:00:00"),
    f(1, 38, 766, "Interessado: 42 - FUNDO EXEMPLO CPF/CNPJ: 11.222.333/0001-44"),
    f(1, 38, 740, "Assunto: INCLUSÃO - PCA"),
    f(1, 38, 726, "Data documento: Valor: Número do documento: 40,00"),
    f(1, 38, 712, "Observação: PCA 2027"),
    f(1, 38, 698, "Usuário: Local repartição: joao.silva SME EDUCACAO"),
    // p2-3 = DFD 100 (mesmo número em páginas consecutivas → 1 só DFD)
    ...dfdNaPagina(2, "100"),
    f(3, 150, 760, "AQUISIÇÃO Número DFD:100 / Planejamento: 1"),
    // p4 = separador (Assinaturas Digitais, sem Número DFD)
    f(4, 100, 700, "Assinaturas Digitais"),
    // p5 = DFD 200
    ...dfdNaPagina(5, "200"),
    // p6 = separador
    f(6, 100, 700, "Assinaturas Digitais"),
    // p7 = DFD 300 MALFORMADO (número, mas sem tabela)
    f(7, 150, 760, "AQUISIÇÃO Número DFD:300 / Planejamento: 1"),
    f(7, 38, 700, "1 - ÁREA REQUISITANTE DA DEMANDA"),
  ];
}

describe("parse-protocolo-pdf-core", () => {
  it("extrai os metadados da CAPA DO PROCESSO", () => {
    const r = parseProtocoloFromPdfItems(protocoloPdf(), "proto.pdf");
    assert.equal(r.protocolo.numero, "12345/2026");
    assert.equal(r.protocolo.data, "01/02/2026 10:00:00");
    assert.equal(r.protocolo.interessado, "42 - FUNDO EXEMPLO");
    assert.equal(r.protocolo.documento, "11.222.333/0001-44");
    assert.equal(r.protocolo.assunto, "INCLUSÃO - PCA");
    assert.equal(r.protocolo.valorCapa, 40);
    assert.equal(r.protocolo.observacao, "PCA 2027");
    assert.equal(r.protocolo.localReparticao, "SME EDUCACAO"); // usuário removido
    assert.equal(r.protocolo.nomeArquivo, "proto.pdf");
  });

  it("fatia o bundle em DFDs por 'Número DFD' (páginas consecutivas = 1 DFD)", () => {
    const r = parseProtocoloFromPdfItems(protocoloPdf(), "proto.pdf");
    assert.equal(r.dfds.length, 2);
    assert.deepEqual(
      r.dfds.map((d) => d.numero),
      ["100", "200"],
    );
    assert.equal(r.dfds[0].itens.length, 1);
    assert.equal(r.dfds[0].itens[0].valorUnitario, 10);
    assert.equal(r.dfds[0].setorRequisitante, "SME - SECRETARIA MUNICIPAL DE EDUCAÇÃO");
  });

  it("isola o DFD malformado num erro (sem derrubar os válidos)", () => {
    const r = parseProtocoloFromPdfItems(protocoloPdf(), "proto.pdf");
    assert.equal(r.erros.length, 1);
    assert.equal(r.erros[0].numero, "300");
    assert.equal(r.erros[0].ordem, 3);
    assert.match(r.erros[0].erro, /itens/i);
  });
});
