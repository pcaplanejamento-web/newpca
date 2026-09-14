import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linhasDeTexto, type PdfItem, parseDfdFromPdfItems } from "../src/lib/parse-dfd-pdf-core.ts";
import { classificarPdf, indexarProtocolo, type PaginaTexto } from "../src/lib/parse-protocolo-pdf-core.ts";

// Índice LEVE do protocolo: recebe o texto por página (barato) e detecta a capa +
// os DFDs (nº, páginas, cabeçalho) sem remontar tabelas. O parse completo por DFD
// (`parseDfdFromPdfItems`) é testado em parse-dfd-pdf.test.ts e exercitado aqui.
// Fixture: p1 = CAPA; p2-3 = DFD 100 (multi-página, mesmo número → 1 DFD);
// p4 = separador; p5 = DFD 200; p6 = separador; p7 = DFD 300 sem tabela.

const f = (page: number, x: number, y: number, str: string): PdfItem => ({ page, x, y, str });

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

function protocoloItems(): PdfItem[] {
  return [
    // p1 = capa
    f(1, 100, 800, "CAPA DO PROCESSO 12345/2026"),
    f(1, 38, 780, "Número Processo: 12345/2026 Data /Hora: Id: 999 01/02/2026 10:00:00"),
    f(1, 38, 766, "Interessado: 42 - FUNDO EXEMPLO CPF/CNPJ: 11.222.333/0001-44"),
    f(1, 38, 740, "Assunto: INCLUSÃO - PCA"),
    f(1, 38, 726, "Data documento: Valor: Número do documento: 40,00"),
    f(1, 38, 712, "Observação: PCA 2027"),
    f(1, 38, 698, "Usuário: Local repartição: joao.silva SME EDUCACAO"),
    // p2-3 = DFD 100 (mesmo número em páginas consecutivas → 1 DFD)
    ...dfdNaPagina(2, "100"),
    f(3, 150, 760, "AQUISIÇÃO Número DFD:100 / Planejamento: 1"),
    // p4 = separador (sem Número DFD)
    f(4, 100, 700, "Assinaturas Digitais"),
    // p5 = DFD 200
    ...dfdNaPagina(5, "200"),
    // p6 = separador
    f(6, 100, 700, "Assinaturas Digitais"),
    // p7 = DFD 300 sem tabela (número presente; parse completo falharia)
    f(7, 150, 760, "AQUISIÇÃO Número DFD:300 / Planejamento: 1"),
    f(7, 38, 700, "1 - ÁREA REQUISITANTE DA DEMANDA"),
  ];
}

/** Converte os trechos em texto por página (o que o navegador passa ao índice). */
function paginasDe(items: PdfItem[]): PaginaTexto[] {
  const byPage = new Map<number, PdfItem[]>();
  for (const it of items) {
    const a = byPage.get(it.page) ?? [];
    a.push(it);
    byPage.set(it.page, a);
  }
  return [...byPage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([page, its]) => ({ page, lines: linhasDeTexto(its) }));
}

describe("indexarProtocolo (índice leve)", () => {
  it("extrai os metadados da CAPA DO PROCESSO", () => {
    const idx = indexarProtocolo(paginasDe(protocoloItems()), "proto.pdf");
    assert.equal(idx.protocolo.numero, "12345/2026");
    assert.equal(idx.protocolo.idExterno, "999"); // "Id:" da capa
    assert.equal(idx.protocolo.data, "01/02/2026 10:00:00");
    assert.equal(idx.protocolo.interessado, "42 - FUNDO EXEMPLO");
    assert.equal(idx.protocolo.documento, "11.222.333/0001-44");
    assert.equal(idx.protocolo.assunto, "INCLUSÃO - PCA");
    assert.equal(idx.protocolo.valorCapa, 40);
    assert.equal(idx.protocolo.observacao, "PCA 2027");
    assert.equal(idx.protocolo.localReparticao, "SME EDUCACAO");
    assert.equal(idx.protocolo.nomeArquivo, "proto.pdf");
  });

  it("detecta os DFDs por 'Número DFD' (páginas consecutivas = 1 DFD) + cabeçalho", () => {
    const idx = indexarProtocolo(paginasDe(protocoloItems()), "proto.pdf");
    assert.deepEqual(
      idx.dfds.map((d) => d.numero),
      ["100", "200", "300"],
    );
    assert.deepEqual(idx.dfds[0].pages, [2, 3]); // multi-página agrupado
    assert.deepEqual(idx.dfds[1].pages, [5]);
    assert.deepEqual(idx.dfds[2].pages, [7]);
    assert.equal(idx.dfds[0].setorRequisitante, "SME - SECRETARIA MUNICIPAL DE EDUCAÇÃO");
    assert.equal(idx.dfds[0].siglaSetor, "SME");
    assert.equal(idx.dfds[2].setorRequisitante, null); // DFD 300 sem setor
  });

  it("as páginas de um DFD detectado fazem o parse completo (integração)", () => {
    const items = protocoloItems();
    const idx = indexarProtocolo(paginasDe(items), "proto.pdf");
    const dfd100 = idx.dfds[0];
    const itensDfd = items.filter((i) => dfd100.pages.includes(i.page));
    const d = parseDfdFromPdfItems(itensDfd, "proto.pdf");
    assert.equal(d.numero, "100");
    assert.equal(d.itens.length, 1);
    assert.equal(d.itens[0].valorUnitario, 10);
  });

  it("um DFD sem tabela (300) lança no parse completo → vira bloqueado no import", () => {
    const items = protocoloItems();
    const p7 = items.filter((i) => i.page === 7);
    assert.throws(() => parseDfdFromPdfItems(p7, "proto.pdf"), /itens|Número DFD/i);
  });
});

describe("classificarPdf (separa as vias / recusa documento errado)", () => {
  it("capa + vários DFDs → protocolo", () => {
    assert.equal(classificarPdf(paginasDe(protocoloItems())), "protocolo");
  });
  it("um único DFD sem capa → dfd", () => {
    assert.equal(classificarPdf(paginasDe(dfdNaPagina(1, "100"))), "dfd");
  });
  it("dois DFDs sem capa → protocolo (bundle)", () => {
    const items = [...dfdNaPagina(1, "100"), ...dfdNaPagina(2, "200")];
    assert.equal(classificarPdf(paginasDe(items)), "protocolo");
  });
  it("sem Número DFD e sem capa → desconhecido", () => {
    const items = [f(1, 100, 700, "DOCUMENTO QUALQUER SEM DFD")];
    assert.equal(classificarPdf(paginasDe(items)), "desconhecido");
  });
});
