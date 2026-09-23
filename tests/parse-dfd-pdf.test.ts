import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buracosSequencia } from "../src/lib/parse-dfd-comum.ts";
import {
  assinaturasAdobeDeTexto,
  assinaturasDropsignerDeTexto,
  limparAssinaturasDoTexto,
  type PdfItem,
  parseDfdFromPdfItems,
  removerAparenciaAssinatura,
} from "../src/lib/parse-dfd-pdf-core.ts";

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

// ── Fixture MULTIPÁGINA: tabela que ocupa 3 páginas, com o cabeçalho do documento
// E o cabeçalho de coluna REPETIDOS em cada página e o `y` REINICIADO por página
// (exatamente como o pdf.js entrega). Cada página tem itens; a última tem o total
// geral + texto de apoio + Seção 5. É o cenário que truncava a importação. ──
const docHeader = (page: number): PdfItem[] => [
  f(page, 150, 760, "ESTADO DE GOIÁS"),
  f(page, 150, 750, "AQUISIÇÃO DE MATERIAL Número DFD:1586 / Planejamento: 1639"),
  f(page, 150, 740, "Tipo DFD: DFD-O — Ordinário"),
];
const colHeader = (page: number): PdfItem[] => [
  f(page, 48, 427, "ITEM"),
  f(page, 85, 427, "CÓDIGO"),
  f(page, 206, 427, "DESCRIÇÃO"),
  f(page, 346, 427, "UNIDADE"),
  f(page, 395, 427, "QUANTIDADE"),
  f(page, 507, 427, "VALOR TOTAL"),
  f(page, 458, 423, "UNITÁRIO"),
];
const footer = (page: number): PdfItem[] => [
  f(page, 40, 40, `Centi ® e-Assinatura: ABC${page}dg58teX`),
  f(page, 300, 40, `Emitido em 13/08/2026 por gisele.soares`),
  f(page, 500, 40, `Página ${page} de 3`),
];
const item = (page: number, y: number, n: number, cod: string, desc: string): PdfItem[] => [
  f(page, 55, y, String(n)),
  f(page, 82, y + 4, cod),
  f(page, 123, y, desc),
  f(page, 353, y, "UNIDADE"),
  f(page, 419, y, "10,0000"),
  f(page, 466, y, "100,0000"),
  f(page, 515, y, "1.000,0000"),
];
function dfdMultipagina(): PdfItem[] {
  return [
    ...docHeader(1),
    f(1, 38, 620, "2 - IDENTIFICAÇÃO DA DEMANDA"),
    f(1, 38, 606, "MATERIAL HOSPITALAR."),
    f(1, 38, 450, "4 - QUANTIDADE DE MATERIAL/SERVIÇOS A SER CONTRATADA"),
    ...colHeader(1),
    ...item(1, 400, 1, "524000001", "ITEM UM DESCRICAO"),
    ...item(1, 360, 2, "524000002", "ITEM DOIS DESCRICAO"),
    ...footer(1),
    // Página 2 — cabeçalhos REPETIDOS, `y` REINICIADO (mesma faixa da página 1).
    ...docHeader(2),
    ...colHeader(2),
    ...item(2, 400, 3, "524000003", "ITEM TRES DESCRICAO"),
    ...item(2, 360, 4, "524000004", "ITEM QUATRO DESCRICAO"),
    ...footer(2),
    // Página 3 — itens finais + total geral + texto de apoio + Seção 5.
    ...docHeader(3),
    ...colHeader(3),
    ...item(3, 400, 5, "524000005", "ITEM CINCO DESCRICAO"),
    ...item(3, 360, 6, "524000006", "ITEM SEIS DESCRICAO"),
    f(3, 451, 321, "VALOR TOTAL"),
    f(3, 515, 321, "6.000,0000"),
    f(3, 38, 310, "O QUANTITATIVO FOI DEFINIDO COM BASE NO LEVANTAMENTO DAS NECESSIDADES."),
    f(3, 38, 259, "5 - PREVISÃO DE ENTREGA/EXECUÇÃO"),
    f(3, 38, 245, "ANUAL."),
    ...footer(3),
  ];
}

// ── Fixture: descrição ALTA (várias linhas) com número/código/valores no MEIO da
// célula (como o pdf.js entrega DFDs reais). As últimas linhas do item 1 ficam mais
// perto da âncora do item 2 → com `nearestByY` vazavam para o item 2 (descrição
// TRUNCADA, exatamente o bug relatado). O "respiro" da borda da célula (vão 338→322 =
// 16, contra 9 das linhas internas) marca onde um item termina e o outro começa. ──
function dfdDescricaoAlta(): PdfItem[] {
  return [
    f(1, 150, 760, "AQUISIÇÃO DE MATERIAL Número DFD:1395 / Planejamento: 1400"),
    f(1, 38, 620, "2 - IDENTIFICAÇÃO DA DEMANDA"),
    f(1, 38, 606, "AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS."),
    f(1, 38, 450, "4 - QUANTIDADE DE MATERIAL/SERVIÇOS A SER CONTRATADA"),
    f(1, 48, 427, "ITEM"),
    f(1, 85, 427, "CÓDIGO"),
    f(1, 206, 427, "DESCRIÇÃO"),
    f(1, 346, 427, "UNIDADE"),
    f(1, 395, 427, "QUANTIDADE"),
    f(1, 507, 427, "VALOR TOTAL"),
    f(1, 458, 423, "UNITÁRIO"),
    // Item 1 — descrição de 9 linhas; âncora (nº/código/valores) na 5ª linha (meio).
    f(1, 123, 410, "ACHOCOLATADO 400 GRAMAS ACHOCOLATADO EM PO,"),
    f(1, 123, 401, "SENDO OBTIDAS POR MATERIAS PRIMAS SAS E LIMPAS,"),
    f(1, 123, 392, "ISENTAS DE MATERIAS TERROSAS, PARASITAS, DETRITOS"),
    f(1, 123, 383, "DE ANIMAIS, CASCAS DE SEMENTES DE CACAU E OUTROS"),
    f(1, 82, 376, "524190442"),
    f(1, 55, 374, "1"),
    f(1, 123, 374, "DETRITOS VEGETAIS, ASPECTO, PO HOMOGENEO, COR"),
    f(1, 353, 374, "UNIDADE"),
    f(1, 419, 374, "10,0000"),
    f(1, 466, 374, "5,1100"),
    f(1, 515, 374, "51,1000"),
    f(1, 82, 372, "7"),
    f(1, 123, 365, "PROPRIA, CHEIRO E SABOR CARACTERISTICO,"),
    f(1, 123, 356, "EMBALAGEM PLASTICA ATOXICA DE"),
    f(1, 123, 347, "400G. SIMILAR A MARCA TODDY OU DE MELHOR"),
    f(1, 123, 338, "QUALIDADE"),
    // Item 2 — começa após o respiro da borda da célula (338 → 322).
    f(1, 123, 322, "ACUCAR EM SACHE 5GR REFINADO. VALIDADE MINIMA DE"),
    f(1, 82, 313, "5241913958"),
    f(1, 55, 313, "2"),
    f(1, 123, 313, "6 MESES NA ENTREGA. CAIXA COM 400 UNIDADES,"),
    f(1, 353, 313, "CAIXA"),
    f(1, 419, 313, "2,0000"),
    f(1, 466, 313, "27,4800"),
    f(1, 515, 313, "54,9600"),
    f(1, 123, 304, "SIMILAR A MARCA UNIAO."),
    f(1, 451, 285, "VALOR TOTAL"),
    f(1, 515, 285, "106.060,0000"),
    f(1, 38, 259, "5 - PREVISÃO DE ENTREGA/EXECUÇÃO"),
    f(1, 38, 245, "ANUAL."),
  ];
}

// ── Fixture CROSS-PAGE (o bug do Protocolo FMC.pdf, itens 20/21 do DFD 1395): a âncora
// (nº/código/valores) fica no MEIO da célula. O item B (SAL) é o último da página 1 e sua
// CAUDA vira a página (continua no topo da p2); o item C (SUCO) é o 1º da p2 e sua CABEÇA
// fica ACIMA do seu número. A regra antiga jogava TUDO acima do 1º número da p2 no item B →
// roubava a cabeça de C. Espaçamento 8 (entrelinha) e borda de célula 13 (p2: 524→511). ──
function dfdCrossPage(): PdfItem[] {
  return [
    // Página 1: cabeçalho + item B (SAL), cuja cauda alcança o fim da página.
    f(1, 150, 760, "AQUISIÇÃO DE MATERIAL Número DFD:1500 / Planejamento: 1"),
    f(1, 48, 560, "ITEM"),
    f(1, 85, 560, "CÓDIGO"),
    f(1, 206, 560, "DESCRIÇÃO"),
    f(1, 346, 560, "UNIDADE"),
    f(1, 395, 560, "QUANTIDADE"),
    f(1, 507, 560, "VALOR TOTAL"),
    f(1, 458, 556, "UNITÁRIO"),
    f(1, 123, 470, "SAL REFINADO IODADO COM GRANULACAO"),
    f(1, 123, 462, "UNIFORME COM CRISTAIS BRANCOS COM NO"),
    f(1, 82, 454, "524170578"),
    f(1, 55, 454, "1"),
    f(1, 123, 454, "MINIMO DE CLORETO DE SODIO E DOSAGEM"),
    f(1, 353, 454, "UNIDADE"),
    f(1, 419, 454, "5,0000"),
    f(1, 466, 454, "1,1800"),
    f(1, 515, 454, "5,9000"),
    f(1, 123, 446, "DE SAIS DE IODO DE NO MINIMO 10MG E"),
    f(1, 123, 438, "MAXIMO DE 15MG DE IODO POR QUILO DE"),
    // Página 2: cabeçalho REPETIDO + continuação da cauda de B + item C (SUCO).
    f(2, 150, 760, "AQUISIÇÃO DE MATERIAL Número DFD:1500 / Planejamento: 1"),
    f(2, 48, 560, "ITEM"),
    f(2, 85, 560, "CÓDIGO"),
    f(2, 206, 560, "DESCRIÇÃO"),
    f(2, 346, 560, "UNIDADE"),
    f(2, 395, 560, "QUANTIDADE"),
    f(2, 507, 560, "VALOR TOTAL"),
    f(2, 458, 556, "UNITÁRIO"),
    f(2, 123, 540, "ACORDO COM A LEGISLACAO FEDERAL"),
    f(2, 123, 532, "ESPECIFICA EMB 1KG VALIDADE MINIMA"),
    f(2, 123, 524, "DE 12 MESES APOS FABRICACAO"),
    // borda de célula (524 → 511 = vão 13) separa a cauda de B da cabeça de C
    f(2, 123, 511, "SUCO EM PO EMBALAGEM DE 1 KG SABORES"),
    f(2, 123, 503, "SORTIDOS TIPO ARTIFICIAL COLORIDO"),
    f(2, 82, 495, "524173208"),
    f(2, 55, 495, "2"),
    f(2, 123, 495, "ARTIFICIALMENTE ADOCADO COM RENDIMENTO"),
    f(2, 353, 495, "UNIDADE"),
    f(2, 419, 495, "30,0000"),
    f(2, 466, 495, "7,5500"),
    f(2, 515, 495, "226,5000"),
    f(2, 123, 487, "DE 10 LITROS EMBALAGEM ATOXICA COM"),
    f(2, 123, 479, "PRAZO MINIMO DE VALIDADE 06 MESES"),
    f(2, 451, 455, "VALOR TOTAL"),
    f(2, 515, 455, "232.400,0000"),
    f(2, 38, 430, "5 - PREVISÃO DE ENTREGA/EXECUÇÃO"),
    f(2, 38, 420, "ANUAL."),
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

  it("coleta as seções 2, 4 (apoio), 5, 7 (ignora a 1 e as linhas de item)", () => {
    const d = parseDfdFromPdfItems(dfdPdf(), "x.pdf");
    const nums = d.secoes.map((s) => s.numero);
    assert.deepEqual(nums, [2, 4, 5, 7]);
    assert.ok(d.secoes.find((s) => s.numero === 7)?.texto.includes("14.133"));
    // Seção 4 = texto de apoio abaixo da tabela (não as linhas de item).
    assert.ok(d.secoes.find((s) => s.numero === 4)?.texto.includes("ESTIMATIVA"));
  });

  it("captura TODOS os itens de uma tabela MULTIPÁGINA (cabeçalho repetido + y reiniciado)", () => {
    const d = parseDfdFromPdfItems(dfdMultipagina(), "multi.pdf");
    // 6 itens em 3 páginas — nenhum truncado.
    assert.equal(d.itens.length, 6);
    assert.deepEqual(
      d.itens.map((i) => i.item),
      [1, 2, 3, 4, 5, 6],
    );
    assert.deepEqual(
      d.itens.map((i) => i.codigo),
      ["524000001", "524000002", "524000003", "524000004", "524000005", "524000006"],
    );
    // Descrição casada com o item CERTO (sem vazamento entre páginas).
    assert.ok(d.itens[2].descricao?.includes("TRES"));
    assert.ok(d.itens[5].descricao?.includes("SEIS"));
    // Valores por item preservados em todas as páginas.
    assert.equal(d.itens[3].valorUnitario, 100);
    assert.equal(d.itens[3].quantidade, 10);
    // Total geral (última página) + texto de apoio.
    assert.equal(d.valorTotal, 6000);
    assert.ok(d.secoes.find((s) => s.numero === 4)?.texto.includes("QUANTITATIVO"));
    assert.ok(d.secoes.find((s) => s.numero === 5));
  });

  it("descrição ALTA (várias linhas) vem INTEIRA e não vaza para o próximo item", () => {
    const d = parseDfdFromPdfItems(dfdDescricaoAlta(), "achocolatado.pdf");
    assert.equal(d.itens.length, 2);
    assert.equal(d.itens[0].item, 1);
    assert.equal(d.itens[0].codigo, "5241904427"); // código rejuntado (2 linhas)
    // A descrição do item 1 deve vir COMPLETA — da 1ª à 9ª linha (era truncada).
    const desc1 = d.itens[0].descricao ?? "";
    assert.ok(desc1.startsWith("ACHOCOLATADO 400 GRAMAS"), desc1);
    assert.ok(desc1.includes("EMBALAGEM PLASTICA ATOXICA DE"), desc1);
    assert.ok(desc1.includes("400G. SIMILAR A MARCA TODDY OU DE MELHOR"), desc1);
    assert.ok(desc1.endsWith("QUALIDADE"), desc1); // última linha — a que sumia
    // O item 2 NÃO recebe as linhas finais do item 1 (sem vazamento).
    const desc2 = d.itens[1].descricao ?? "";
    assert.equal(d.itens[1].codigo, "5241913958");
    assert.ok(desc2.startsWith("ACUCAR EM SACHE"), desc2);
    assert.ok(!desc2.includes("TODDY"), desc2);
    assert.ok(!desc2.includes("QUALIDADE"), desc2);
  });

  it("QUEBRA DE PÁGINA: a cabeça do 1º item da página não vaza para o item anterior", () => {
    const d = parseDfdFromPdfItems(dfdCrossPage(), "cross.pdf");
    assert.equal(d.itens.length, 2);
    assert.equal(d.itens[0].codigo, "524170578");
    assert.equal(d.itens[1].codigo, "524173208");
    const b = d.itens[0].descricao ?? ""; // SAL — completo, incl. a continuação da p2
    assert.ok(b.startsWith("SAL REFINADO"), b);
    assert.ok(b.includes("MAXIMO DE 15MG"), b); // cauda da p1
    assert.ok(b.includes("DE 12 MESES APOS FABRICACAO"), b); // continuação (virou a página)
    assert.ok(!b.includes("SUCO"), b); // NÃO rouba a cabeça do item C
    const c = d.itens[1].descricao ?? ""; // SUCO — com a CABEÇA (não truncado)
    assert.ok(c.startsWith("SUCO EM PO"), c);
    assert.ok(c.includes("TIPO ARTIFICIAL"), c);
    assert.ok(c.trimEnd().endsWith("06 MESES"), c);
  });

  it("numeração com BURACO no sequencial (item removido) importa normal e só APONTA o buraco", () => {
    // Remove TODO o item 4 → 1,2,3,5,6, como um item fracassado que some da tabela.
    // Buracos no sequencial são NORMAIS → NÃO bloqueia nem lança; só é apontado.
    const semItem4 = dfdMultipagina().filter((it) => !(it.page === 2 && it.y >= 356 && it.y <= 366));
    const d = parseDfdFromPdfItems(semItem4, "multi.pdf");
    assert.deepEqual(
      d.itens.map((i) => i.item),
      [1, 2, 3, 5, 6],
    );
    assert.deepEqual(buracosSequencia(d.itens), [4]); // aponta o nº pulado
  });

  it("buracosSequencia: sequência completa não tem buraco", () => {
    const d = parseDfdFromPdfItems(dfdMultipagina(), "multi.pdf");
    assert.deepEqual(buracosSequencia(d.itens), []);
  });

  it("lança erro claro quando falta o Número DFD", () => {
    const aoa = dfdPdf().filter((i) => !/Número DFD/.test(i.str));
    assert.throws(() => parseDfdFromPdfItems(aoa, "x.pdf"), /Número DFD/i);
  });

  // Escala: um DFD com MILHARES de itens deve parsear correto e rápido (o matcher
  // é O(n log n); com o antigo O(n²) isto travaria por segundos).
  it("parseia um DFD com milhares de itens (matcher O(n log n))", () => {
    const N = 2000;
    const it: PdfItem[] = [
      f(1, 150, 760, "AQUISIÇÃO Número DFD:1586 / Planejamento: 1"),
      f(1, 48, 450, "ITEM"),
      f(1, 85, 450, "CÓDIGO"),
      f(1, 206, 450, "DESCRIÇÃO"),
      f(1, 346, 450, "UNIDADE"),
      f(1, 395, 450, "QUANTIDADE"),
      f(1, 458, 450, "UNITÁRIO"),
      f(1, 507, 450, "VALOR TOTAL"),
    ];
    for (let i = 1; i <= N; i++) {
      const y = 440 - i * 8; // cada item numa linha própria (>2pt de distância)
      it.push(f(1, 55, y, String(i)));
      it.push(f(1, 82, y, String(100000 + i))); // código (dígitos)
      it.push(f(1, 123, y, `PRODUTO ${i}`));
      it.push(f(1, 353, y, "UN"));
      it.push(f(1, 419, y, "1,0000"));
      it.push(f(1, 466, y, "2,0000"));
      it.push(f(1, 515, y, "2,0000"));
    }
    const t0 = Date.now();
    const d = parseDfdFromPdfItems(it, "grande.pdf");
    assert.equal(d.itens.length, N);
    assert.equal(d.itens[0].item, 1);
    assert.equal(d.itens[0].codigo, "100001");
    assert.equal(d.itens[N - 1].item, N);
    assert.ok(d.itens.every((x) => x.valorUnitario === 2)); // cada fragmento no bucket certo
    assert.ok(Date.now() - t0 < 4000, "parse de DFD grande deve ser rápido");
  });
});

// Formato C — assinatura Dropsigner do TEXTO RENDERIZADO (getOperatorList), que inclui a
// APARÊNCIA das anotações de assinatura. Fixtures modeladas no texto render real do Protocolo 4
// (o bloco sai CONTÍGUO: "Assinado digitalmente por: NOME CPF: … Data: …", com a marca d'água).
describe("assinaturasDropsignerDeTexto (Formato C — texto renderizado)", () => {
  it("extrai nome/CPF/data/código do bloco (aparência da anotação de assinatura)", () => {
    const texto =
      "10 - AUTORIZAÇÃO DEMANDA Autorizo o início da formalização da demanda. " +
      "Assinado digitalmente por: EDUARDO STEFANI CPF: ***.719.478-** Data: 01/09/2026 14:36:17 -03:00 " +
      "Documento assinado no Dropsigner. Para validar acesse https://www.dropsigner.com/validate/JEMJJ-BV2QC-RSDRW-DC523.";
    const ass = assinaturasDropsignerDeTexto(texto);
    assert.equal(ass.length, 1);
    assert.equal(ass[0].nome, "EDUARDO STEFANI");
    assert.equal(ass[0].eCpf, "***.719.478-**");
    assert.equal(ass[0].data, "01/09/2026 14:36:17 -03:00");
    assert.equal(ass[0].codigo, "JEMJJ-BV2QC-RSDRW-DC523");
    assert.ok(ass[0].url.includes("dropsigner.com/validate/JEMJJ-BV2QC-RSDRW-DC523"));
    assert.equal(ass[0].fonte, "dropsigner");
  });

  it("marca d'água repetida (várias páginas) → 1 assinatura (dedupe por código+nome+data)", () => {
    const texto =
      "Assinado digitalmente por: EDUARDO STEFANI CPF: ***.719.478-** Data: 01/09/2026 14:36:17 -03:00 " +
      "Documento assinado no Dropsigner. Acesse https://www.dropsigner.com/validate/JEMJJ-BV2QC-RSDRW-DC523. " +
      "…continuação… Documento assinado no Dropsigner. Acesse https://www.dropsigner.com/validate/JEMJJ-BV2QC-RSDRW-DC523.";
    const ass = assinaturasDropsignerDeTexto(texto);
    assert.equal(ass.length, 1);
  });

  it("marca d'água SEM bloco visível → 1 assinatura reconhecida (só código, sem nome)", () => {
    // Caso comum: a Seção 10 mostra só o cargo; o documento tem o carimbo Dropsigner.
    const texto =
      "10 - AUTORIZAÇÃO DEMANDA Autorizo o início da formalização da demanda. SECRETÁRIO MUNICIPAL DE SAÚDE " +
      "Documento assinado no Dropsigner. Acesse https://www.dropsigner.com/validate/PMZ4G-FP9KD-MKT69-NZQW2.";
    const ass = assinaturasDropsignerDeTexto(texto);
    assert.equal(ass.length, 1);
    assert.equal(ass[0].fonte, "dropsigner");
    assert.equal(ass[0].codigo, "PMZ4G-FP9KD-MKT69-NZQW2");
    assert.equal(ass[0].nome, ""); // sem bloco → nome vazio (verificável pela URL)
  });

  it("sem marca d'água Dropsigner → [] (não inventa assinatura)", () => {
    assert.deepEqual(assinaturasDropsignerDeTexto("Assinado digitalmente por: FULANO CPF: ***.1-** Data: 01/01/2026"), []);
  });

  it("NÃO casa o Formato B (sem dois-pontos após 'por') mesmo com carimbo → só o bare", () => {
    const texto =
      "Assinado digitalmente por MAYANA BARBOSA, portador do CPF: ***.877.935-**, em 27/08/2026 15:05:00. " +
      "Documento assinado no Dropsigner. Acesse https://www.dropsigner.com/validate/ABCDE-11111-22222-33333.";
    const ass = assinaturasDropsignerDeTexto(texto);
    assert.equal(ass.length, 1);
    assert.equal(ass[0].nome, ""); // Formato B não vira bloco Dropsigner; fica o bare do carimbo
    assert.equal(ass[0].codigo, "ABCDE-11111-22222-33333");
  });

  it("ponto 4 — bloco em INGLÊS (Digitally signed by / Date M/D/AAAA AM-PM) → normaliza a data", () => {
    const texto =
      "10 - AUTORIZAÇÃO DEMANDA Autorizo o início da formalização da demanda. " +
      "Digitally signed by: PEDRO HENRIQUE ARAUJO CUNHA CPF: ***.324.501-** Date: 9/1/2026 2:00:52 PM -03:00 " +
      "Documento assinado no Dropsigner. Acesse https://www.dropsigner.com/validate/7X4UJ-VXUC6-TXQL9-8SRAY.";
    const ass = assinaturasDropsignerDeTexto(texto);
    assert.equal(ass.length, 1);
    assert.equal(ass[0].nome, "PEDRO HENRIQUE ARAUJO CUNHA");
    assert.equal(ass[0].eCpf, "***.324.501-**");
    assert.equal(ass[0].data, "01/09/2026 14:00:52 -03:00"); // M/D→D/M + 12h→24h (AM/PM)
    assert.equal(ass[0].codigo, "7X4UJ-VXUC6-TXQL9-8SRAY");
    assert.equal(ass[0].fonte, "dropsigner");
  });

  it("ponto 2 — só o documento PRIMÁRIO: anexo (OUTRO código, outra página) é descartado", () => {
    const paginaDfd =
      "Assinado digitalmente por: EVERALDO LEITE RIBEIRO CPF: ***.684.691-** Data: 02/09/2026 15:34:01 -03:00 " +
      "Documento assinado no Dropsigner. Acesse https://www.dropsigner.com/validate/AAAAA-11111-22222-33333.";
    const paginaAnexo =
      "Assinado digitalmente por: WELLINGTON PREFEITO CPF: ***.000.000-** Data: 27/07/2026 10:00:00 -03:00 " +
      "Documento assinado no Dropsigner. Acesse https://www.dropsigner.com/validate/BBBBB-99999-88888-77777.";
    const ass = assinaturasDropsignerDeTexto([paginaDfd, paginaAnexo]);
    assert.equal(ass.length, 1);
    assert.equal(ass[0].nome, "EVERALDO LEITE RIBEIRO");
    assert.equal(ass[0].codigo, "AAAAA-11111-22222-33333"); // 1ª página (o DFD); o anexo é descartado
  });

  it("variante 'Assinado ELETRONICAMENTE por:' COM CPF (real: WELLINGTON) → extrai tudo", () => {
    const texto =
      "9 - AUTORIZAÇÃO DEMANDA Centi ® e-Assinatura: 0pFÇdZ58teX Emitido em 26/06/2026 13:50 por fernanda.mello " +
      "Documento assinado no Dropsigner. Para validar acesse https://www.dropsigner.com/validate/TL6S2-3YJP7-DXG63-VFGLX. " +
      "Assinado eletronicamente por: WELLINGTON SOARES CARRIJO FILHO CPF: ***.786.871-** Data: 26/06/2026 15:09:23 -03:00";
    const ass = assinaturasDropsignerDeTexto(texto);
    assert.equal(ass.length, 1);
    assert.equal(ass[0].nome, "WELLINGTON SOARES CARRIJO FILHO");
    assert.equal(ass[0].eCpf, "***.786.871-**");
    assert.equal(ass[0].data, "26/06/2026 15:09:23 -03:00");
    assert.equal(ass[0].codigo, "TL6S2-3YJP7-DXG63-VFGLX");
    assert.equal(ass[0].fonte, "dropsigner");
  });

  it("variante 'Assinado ELETRONICAMENTE por:' SEM CPF (real: Ricardo) → nome + data, CPF vazio", () => {
    const texto =
      "Documento assinado no Dropsigner. Para validar acesse https://www.dropsigner.com/validate/R7AJA-CFS64-KH2X5-UKGTG. " +
      "Assinado eletronicamente por: Ricardo Rocha Batista Data: 30/06/2026 16:34:45 -03:00";
    const ass = assinaturasDropsignerDeTexto(texto);
    assert.equal(ass.length, 1);
    assert.equal(ass[0].nome, "Ricardo Rocha Batista");
    assert.equal(ass[0].eCpf, ""); // bloco sem CPF → e-CPF vazio (sem quebrar)
    assert.equal(ass[0].data, "30/06/2026 16:34:45 -03:00");
    assert.equal(ass[0].codigo, "R7AJA-CFS64-KH2X5-UKGTG");
    assert.equal(ass[0].fonte, "dropsigner");
  });
});

// Formato D — assinatura Adobe / ICP-Brasil (PAdES) do TEXTO RENDERIZADO. Fixture modelada no render
// real do Protocolo 4 (DFD 1483): "Assinado de forma digital por NOME:CPF Dados: AAAA.MM.DD ... -03'00'".
describe("assinaturasAdobeDeTexto (Formato D — Adobe/ICP-Brasil)", () => {
  it("extrai nome (separando o CPF do CN, mascarado) e a data normalizada", () => {
    const texto =
      "RHAFAEL PEREIRA BARROS:0185162 6140 " +
      "Assinado de forma digital por RHAFAEL PEREIRA BARROS:01851626140 Dados: 2026.09.01 14:58:52 -03'00'";
    const ass = assinaturasAdobeDeTexto(texto);
    assert.equal(ass.length, 1);
    assert.equal(ass[0].nome, "RHAFAEL PEREIRA BARROS");
    assert.equal(ass[0].eCpf, "***.516.261-**"); // CPF do CN, mascarado como os demais formatos
    assert.equal(ass[0].data, "01/09/2026 14:58:52 -03:00"); // AAAA.MM.DD -03'00' → dd/mm/aaaa -03:00
    assert.equal(ass[0].fonte, "adobe");
    assert.equal(ass[0].codigo, ""); // Adobe não tem código público
    assert.equal(ass[0].url, "");
  });
  it("dedup por nome+data (aparência repetida)", () => {
    const t =
      "Assinado de forma digital por FULANO:12345678901 Dados: 2026.01.02 08:00:00 -03'00' " +
      "Assinado de forma digital por FULANO:12345678901 Dados: 2026.01.02 08:00:00 -03'00'";
    assert.equal(assinaturasAdobeDeTexto(t).length, 1);
  });
  it("CN sem CPF → nome inteiro, CPF vazio; data sem hora", () => {
    const ass = assinaturasAdobeDeTexto("Assinado de forma digital por MARIA DA SILVA Dados: 2026.03.04");
    assert.equal(ass.length, 1);
    assert.equal(ass[0].nome, "MARIA DA SILVA");
    assert.equal(ass[0].eCpf, "");
    assert.equal(ass[0].data, "04/03/2026");
  });
  it("NÃO casa Dropsigner nem A/B (marcadores distintos) → []", () => {
    assert.deepEqual(assinaturasAdobeDeTexto("Assinado digitalmente por: FULANO CPF: ***.1-** Data: 01/01/2026"), []);
    assert.deepEqual(assinaturasAdobeDeTexto("Assinatura digital - Nome: FULANO e-CPF: 1"), []);
  });
  it("PRECISÃO: prosa com 'assinado de forma digital' SEM a data ISO do Adobe → [] (não confunde)", () => {
    // Só casa com os DOIS selos juntos (marcador + data AAAA.MM.DD). Prosa e datas dd/mm/aaaa não casam.
    assert.deepEqual(assinaturasAdobeDeTexto("O documento foi assinado de forma digital por todos os responsáveis em 2026."), []);
    assert.deepEqual(assinaturasAdobeDeTexto("Assinado de forma digital por FULANO Data: 01/09/2026 14:00:00"), []); // dd/mm/aaaa ≠ Adobe
  });
});

// A APARÊNCIA da assinatura Adobe (flatten) fica no getTextContent e VAZAVA para o texto das seções
// (Seção 9/10). `removerAparenciaAssinatura` a retira por GEOMETRIA (coluna direita), sem tocar no
// texto da seção (coluna esquerda). Geometria REAL do DFD 1483 (página 595 de largura).
describe("removerAparenciaAssinatura (aparência Adobe não vaza p/ as seções)", () => {
  const P = (x: number, y: number, str: string): PdfItem => ({ page: 1, x, y, str });
  it("mantém o texto da SEÇÃO (col. esquerda, incl. nome DIGITADO) e remove a APARÊNCIA (col. direita)", () => {
    const items = [
      P(300, 503, "Assinado de forma digital"),
      P(38, 499, "9 - AUTORIZAÇÃO DEMANDA"),
      P(240, 499, "RHAFAEL PEREIRA"),
      P(300, 497, "por RHAFAEL PEREIRA"),
      P(300, 490, "BARROS:01851626140"),
      P(240, 489, "BARROS:0185162"),
      P(38, 485, "Autorizo o início da formalização da demanda."),
      P(38, 478, "PEDRO HENRIQUE ARAUJO CUNHA"), // nome DIGITADO legítimo na coluna da seção
      P(300, 484, "Dados: 2026.09.01"),
      P(240, 480, "6140"),
      P(300, 477, "14:58:52 -03'00'"),
      P(275, 456, "ORDENADOR"),
    ];
    const textos = removerAparenciaAssinatura(items).map((i) => i.str);
    // Seção preservada (incl. o nome digitado na coluna esquerda):
    for (const t of ["9 - AUTORIZAÇÃO DEMANDA", "Autorizo o início da formalização da demanda.", "PEDRO HENRIQUE ARAUJO CUNHA", "ORDENADOR"])
      assert.ok(textos.includes(t), `deveria manter: ${t}`);
    // Aparência removida:
    for (const t of ["Assinado de forma digital", "por RHAFAEL PEREIRA", "BARROS:01851626140", "RHAFAEL PEREIRA", "BARROS:0185162", "Dados: 2026.09.01", "6140", "14:58:52 -03'00'"])
      assert.ok(!textos.includes(t), `deveria remover: ${t}`);
  });
  it("sem âncora de aparência → devolve os itens INALTERADOS (mesma referência; não afeta outros DFDs)", () => {
    const secao = [P(38, 499, "3 - JUSTIFICATIVA"), P(38, 485, "MARIA DA SILVA responsável pela demanda.")];
    assert.equal(removerAparenciaAssinatura(secao), secao);
  });
  it("PROSA com marcador na MARGEM (sem coluna de aparência à direita) → mantém tudo (guarda ≥60pt)", () => {
    // Uma seção cita "assinado de forma digital" e uma data ISO, mas na margem esquerda (x≈38): não
    // há coluna de aparência separada → o corte não se aplica e NADA é removido (anti-corrupção).
    const secao = [
      P(38, 499, "8 - JUSTIFICATIVA"),
      P(38, 485, "O contrato foi assinado de forma digital pelas partes."),
      P(38, 471, "Prazo conforme dados: 2026.05.10 do cronograma."),
    ];
    const textos = removerAparenciaAssinatura(secao).map((i) => i.str);
    assert.ok(textos.includes("O contrato foi assinado de forma digital pelas partes."));
    assert.ok(textos.includes("Prazo conforme dados: 2026.05.10 do cronograma."));
  });
  it("MÚLTIPLAS assinaturas na página → remove os dois blocos; o texto das seções entre elas é preservado", () => {
    const items = [
      // Bloco 1 (§9)
      P(38, 695, "9 - SECRETÁRIO DEMANDANTE"),
      P(300, 700, "Assinado de forma digital"),
      P(240, 693, "FULANO:11111111111"),
      P(300, 690, "Dados: 2026.01.02"),
      P(300, 683, "10:00:00 -03'00'"),
      // Bloco 2 (§10), bem abaixo
      P(38, 495, "10 - AUTORIZAÇÃO DEMANDA"),
      P(38, 485, "Autorizo o início."),
      P(300, 500, "Assinado de forma digital"),
      P(240, 493, "BELTRANO:22222222222"),
      P(300, 490, "Dados: 2026.01.03"),
      P(300, 483, "11:00:00 -03'00'"),
    ];
    const textos = removerAparenciaAssinatura(items).map((i) => i.str);
    for (const t of ["9 - SECRETÁRIO DEMANDANTE", "10 - AUTORIZAÇÃO DEMANDA", "Autorizo o início."])
      assert.ok(textos.includes(t), `manter: ${t}`);
    for (const t of ["FULANO:11111111111", "BELTRANO:22222222222", "Dados: 2026.01.02", "Dados: 2026.01.03"])
      assert.ok(!textos.includes(t), `remover: ${t}`);
    assert.ok(!textos.includes("Assinado de forma digital"), "ambos os blocos removidos");
  });
});

// Assinatura em QUALQUER lugar do DFD (margem, sobre o texto, marca d'água): `limparAssinaturasDoTexto`
// tira da camada de texto SÓ o que é assinatura — por trecho/segmento, nunca a linha inteira.
describe("limparAssinaturasDoTexto (assinatura não se confunde com o texto)", () => {
  const P = (x: number, y: number, str: string, extra: Partial<PdfItem> = {}): PdfItem => ({ page: 1, x, y, str, w: str.length * 4.5, h: 9, ...extra });
  const textos = (its: PdfItem[]) => limparAssinaturasDoTexto(its).map((i) => i.str);

  it("mesma LINHA: remove o segmento da assinatura e preserva o texto do DFD ao lado", () => {
    const t = textos([P(38, 500, "Autorizo o início da formalização."), P(320, 500, "Assinado de forma digital por FULANO DE TAL")]);
    assert.deepEqual(t, ["Autorizo o início da formalização."]);
  });

  it("prosa que CITA o marcador no meio da frase é preservada", () => {
    const its = [P(38, 500, "O contrato foi assinado de forma digital pelas partes."), P(38, 486, "Conforme dados: 2026.05.10 do cronograma.")];
    assert.deepEqual(textos(its), its.map((i) => i.str));
  });

  it("Adobe SOBRE o texto (sem coluna separada): tira âncoras, NOME:CPF e nome grande; o texto fica", () => {
    const t = textos([
      P(38, 520, "9 - AUTORIZAÇÃO DEMANDA"),
      P(60, 503, "Assinado de forma digital"),
      P(38, 499, "Autorizo o início da formalização da demanda."),
      P(40, 498, "RHAFAEL PEREIRA", { h: 16 }),
      P(60, 497, "por RHAFAEL PEREIRA"),
      P(60, 490, "BARROS:01851626140"),
      P(60, 484, "Dados: 2026.09.01"),
      P(60, 477, "14:58:52 -03'00'"),
      P(38, 450, "ORDENADOR DE DESPESAS"),
    ]);
    assert.deepEqual(t, ["9 - AUTORIZAÇÃO DEMANDA", "Autorizo o início da formalização da demanda.", "ORDENADOR DE DESPESAS"]);
  });

  it("bloco Dropsigner na camada de texto (qualquer página): tira âncora, nome, CPF e Data — só eles", () => {
    const t = textos([
      P(38, 600, "Justificativa da demanda."),
      P(300, 560, "Assinado eletronicamente por:"),
      P(300, 550, "Hérica Cristina Rodrigues Ribeiro"),
      P(300, 540, "CPF: ***.413.331-**"),
      P(300, 530, "Data: 30/06/2026 19:47:21 -03:00"),
      P(300, 520, "Observação do DFD alinhada ali."),
    ]);
    assert.deepEqual(t, ["Justificativa da demanda.", "Observação do DFD alinhada ali."]);
  });

  it("marca d'água ROTACIONADA some; página toda girada fica intacta", () => {
    const pagina = [P(38, 700, "Texto 1"), P(38, 690, "Texto 2"), P(38, 680, "Texto 3"), P(580, 400, "Documento assinado no Dropsigner. Para validar", { rot: true })];
    assert.deepEqual(textos(pagina), ["Texto 1", "Texto 2", "Texto 3"]);
    const girada = [P(38, 700, "Texto 1", { rot: true }), P(38, 690, "Texto 2", { rot: true })];
    assert.deepEqual(textos(girada), ["Texto 1", "Texto 2"]);
  });

  it("sem assinatura → itens inalterados (mesma referência)", () => {
    const its = [P(38, 700, "3 - JUSTIFICATIVA"), P(38, 690, "MARIA DA SILVA responsável.")];
    assert.equal(limparAssinaturasDoTexto(its), its);
  });
});

// DFD 142 (pd101820 real): a descrição do item começa com "- " ("29 - SEC. DE ASSISTÊNCIA…") e a
// linha parecia um título de seção "29 - …" → a tabela ENCERRAVA ali (32 itens lidos como 2 e as
// linhas dos itens viravam "seções"). Só a seção 5+ (≤20) SEM nada nas colunas de valores encerra.
describe("parseDfdFromPdfItems — item cuja descrição começa com '- ' não encerra a tabela", () => {
  it("lê todos os itens e as seções seguintes corretamente", () => {
    const L: PdfItem[] = [
      f(1, 169, 763, "AQUISIÇÃO DE SERVIÇO Número DFD:142 / Planejamento: 189"),
      f(1, 38, 507, "4 - QUANTIDADE DE MATERIAL/SERVIÇOS A SER CONTRATADA"),
      f(1, 48, 489, "ITEM"),
      f(1, 85, 489, "CÓDIGO"),
      f(1, 206, 489, "DESCRIÇÃO"),
      f(1, 345, 489, "UNIDADE"),
      f(1, 395, 489, "QUANTIDADE"),
      f(1, 507, 489, "VALOR TOTAL"),
      f(1, 458, 485, "UNITÁRIO"),
      f(1, 123, 433, "VIGILÂNCIA ELETRÔNICA COM MONITORAMENTO REMOTO"),
      f(1, 82, 429, "524192487"),
      f(1, 53, 425, "29"),
      f(1, 123, 425, "- SEC. DE ASSISTÊNCIA SOCIAL - SCFV - SETOR MORADA"),
      f(1, 354, 425, "MES"),
      f(1, 419, 425, "12,0000"),
      f(1, 476, 425, "52,6600"),
      f(1, 528, 425, "631,9200"),
      f(1, 97, 421, "5"),
      f(1, 123, 417, "DO SOL"),
      f(1, 82, 405, "524190163"),
      f(1, 123, 405, "VIGILÂNCIA ELETRÔNICA COM MONITORAMENTO REMOTO"),
      f(1, 53, 401, "28"),
      f(1, 354, 401, "MES"),
      f(1, 419, 401, "12,0000"),
      f(1, 476, 401, "52,6600"),
      f(1, 528, 401, "631,9200"),
      f(1, 97, 397, "3"),
      f(1, 123, 397, "- SECRETARIA DE ASSISTÊNCIA SOCIAL- CREAS."),
      f(1, 452, 380, "VALOR TOTAL"),
      f(1, 519, 380, "1.263,8400"),
      f(1, 38, 283, "5 - PREVISÃO DE ENTREGA/EXECUÇÃO"),
      f(1, 38, 269, "12 MESES - PCA 2027."),
      f(1, 38, 247, "6 - PRIORIDADE DA COMPRA OU DA CONTRATAÇÃO"),
      f(1, 38, 233, "BAIXA"),
    ];
    const r = parseDfdFromPdfItems(L, "x.pdf");
    assert.equal(r.itens.length, 2);
    assert.deepEqual(r.itens.map((i) => i.codigo), ["5241924875", "5241901633"]);
    assert.equal(r.itens[0].descricao, "VIGILÂNCIA ELETRÔNICA COM MONITORAMENTO REMOTO - SEC. DE ASSISTÊNCIA SOCIAL - SCFV - SETOR MORADA DO SOL");
    assert.deepEqual(r.secoes.map((s) => s.numero), [5, 6]);
  });
});
