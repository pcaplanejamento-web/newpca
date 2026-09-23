import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PdfTraco } from "../src/lib/grade-pdf.ts";
import {
  agruparLinhas,
  ehCabecalhoItens,
  lerTabelaItens,
  limparAssinaturasDoTexto,
  normalizar,
  type PdfItem,
  parseDfdFromPdfItems,
} from "../src/lib/parse-dfd-pdf-core.ts";
import { dfdCenti, type ItemCenti, linhaDeCelulas, type OpcoesCenti, t } from "./fixtures/dfd-centi.ts";

// CAPTURA DOS ITENS DO DFD no leiaute EXATO do Centi (ver `fixtures/dfd-centi.ts`): cada cenário é lido pela GRADE
// desenhada (caminho de produção) e pela GEOMETRIA DO TEXTO (PDF sem grade) — as duas vias têm de dar o mesmo
// resultado, correto.

const curto = (n: number): ItemCenti => ({ n: String(n), codigo: [String(5241900000 + n)], desc: [`ITEM CURTO NÚMERO ${n}`] });

// O item do PRINT: código de 10 dígitos quebrado ("524194727" ⏎ "0"), descrição enorme colada do Word com
// marcadores (•, e o U+F0B7 da fonte Symbol), TAB, NBSP, largura zero e "M²" — no meio de dezenas de itens curtos.
const ITEM_21: ItemCenti = {
  n: "21",
  codigo: ["524194727", "0"],
  desc: [
    "PAINEL DE LED P3 COM TELA DE ALTA DEFINIÇÃO PARA USO",
    "OUTDOOR COM ESTRUTURA METÁLICA DE",
    ["SUSTENTAÇÃO;", "• DIMENSÕES APROXIMADAS: 3840"],
    ["X 2880 MM;", "• ALTA RESOLUÇÃO COM PITCH"],
    "APROXIMADO DE 5 MM, CONFIGURAÇÃO",
    ["RGB;", "• DENSIDADE MÍNIMA DE 40.000"],
    ["DOTS/M²;", "\uF0B7 ENCAPSULAMENTO SMD OU"],
    "EQUIVALENTE TÉCNICO, ADEQUADO",
    "CENTÍMETROS DE PROFUNDIDADE, COM",
    "MÓDULOS COMPATÍVEIS ENTRE SI;",
    "• ÂNGULO DE VISUALIZAÇÃO",
    "COMPATÍVEL PARA EVENTOS;\t•",
    "BRILHO COMPATÍVEL COM\u00A0AMBIENTE",
    "O VALOR TOTAL INCLUI A INSTALAÇÃO E",
    ["50 M;", "• COMPATIBILIDADE COM"],
    "VÍDEOS, IMAGENS, TEXTOS E CONTEÚDOS",
    ["AUDIOVISUAIS;", "• ESTRUTURA PARA"],
    "MONTAGEM EM EVENTOS\u200B DIVERSOS.",
  ],
  qtd: ["1,0000"],
  vu: ["185.000,0000"],
  vt: ["185.000,0000"],
};
const DESC_21 =
  "PAINEL DE LED P3 COM TELA DE ALTA DEFINIÇÃO PARA USO OUTDOOR COM ESTRUTURA METÁLICA DE SUSTENTAÇÃO; DIMENSÕES " +
  "APROXIMADAS: 3840 X 2880 MM; ALTA RESOLUÇÃO COM PITCH APROXIMADO DE 5 MM, CONFIGURAÇÃO RGB; DENSIDADE MÍNIMA DE " +
  "40.000 DOTS/M²; ENCAPSULAMENTO SMD OU EQUIVALENTE TÉCNICO, ADEQUADO CENTÍMETROS DE PROFUNDIDADE, COM MÓDULOS " +
  "COMPATÍVEIS ENTRE SI; ÂNGULO DE VISUALIZAÇÃO COMPATÍVEL PARA EVENTOS; BRILHO COMPATÍVEL COM AMBIENTE O VALOR " +
  "TOTAL INCLUI A INSTALAÇÃO E 50 M; COMPATIBILIDADE COM VÍDEOS, IMAGENS, TEXTOS E CONTEÚDOS AUDIOVISUAIS; " +
  "ESTRUTURA PARA MONTAGEM EM EVENTOS DIVERSOS.";

const viaGrade = (items: PdfItem[], tracos: PdfTraco[]) => {
  const linhas = agruparLinhas(limparAssinaturasDoTexto(normalizar(items)));
  return lerTabelaItens(linhas, linhas.findIndex(ehCabecalhoItens), tracos).viaGrade;
};

/** Lê o mesmo DFD pela grade E pela geometria do texto (e confere que a grade foi mesmo usada). */
function lerNasDuasVias(itens: ItemCenti[], op: OpcoesCenti = {}) {
  const g = dfdCenti(itens, op);
  const s = dfdCenti(itens, { ...op, semGrade: true });
  assert.equal(viaGrade(g.items, g.tracos), true, "a grade do Centi tem de ser reconhecida");
  return [parseDfdFromPdfItems(g.items, "x.pdf", [], g.tracos), parseDfdFromPdfItems(s.items, "x.pdf")] as const;
}

describe("captura dos itens do DFD (leiaute Centi: grade desenhada e geometria do texto)", () => {
  it("PRINT: código '524194727'⏎'0' inteiro + descrição enorme limpa (sem marcadores/tab/invisíveis), sem vazar", () => {
    const itens = [...Array.from({ length: 20 }, (_, i) => curto(i + 1)), ITEM_21, ...Array.from({ length: 12 }, (_, i) => curto(i + 22))];
    // Texto das seções depois da tabela À DIREITA do código (antes derrubava o início da descrição e mandava o
    // "0" do código p/ a descrição).
    const secoesDepois = [
      { x: 38, str: "8 - INDICAÇÃO DO(S) INTEGRANTE(S) DA EQUIPE DE PLANEJAMENTO" },
      { x: 38, str: "Nome:" },
      { x: 95, str: "Matrícula e Cargo do servidor" },
    ];
    for (const d of lerNasDuasVias(itens, { secoesDepois, total: "185.330,0000" })) {
      assert.equal(d.itens.length, 33);
      const i21 = d.itens.find((i) => i.item === 21);
      assert.equal(i21?.codigo, "5241947270");
      assert.equal(i21?.descricao, DESC_21);
      assert.equal(i21?.valorUnitario, 185000);
      assert.equal(i21?.valorTotal, 185000);
      // Os vizinhos ficam intactos (a cabeça/cauda do item 21 não vaza).
      assert.equal(d.itens.find((i) => i.item === 20)?.descricao, "ITEM CURTO NÚMERO 20");
      assert.equal(d.itens.find((i) => i.item === 22)?.descricao, "ITEM CURTO NÚMERO 22");
      for (const it of d.itens.filter((i) => i.item !== 21)) assert.equal(it.codigo, String(5241900000 + (it.item ?? 0)));
      assert.equal(d.valorTotal, 185330);
    }
  });

  it("linhas da descrição que CITAM rodapé/total/cabeçalho não somem (CENTÍMETROS, PÁGINA, VALOR TOTAL, ITEM…QUANTIDADE, VALOR)", () => {
    const item: ItemCenti = {
      n: "1",
      codigo: ["5241900001"],
      desc: ["MESA DE 120", "CENTÍMETROS DE LARGURA;", "PÁGINA 3 DO CATÁLOGO DO", "FABRICANTE; EMITIDO EM DUAS VIAS;", "O VALOR TOTAL INCLUI O FRETE;", "ITEM NA QUANTIDADE PEDIDA;", "VALOR", "FIM."],
    };
    for (const d of lerNasDuasVias([curto(2), item, curto(3)])) {
      assert.equal(
        d.itens.find((i) => i.item === 1)?.descricao,
        "MESA DE 120 CENTÍMETROS DE LARGURA; PÁGINA 3 DO CATÁLOGO DO FABRICANTE; EMITIDO EM DUAS VIAS; O VALOR TOTAL INCLUI O FRETE; ITEM NA QUANTIDADE PEDIDA; VALOR FIM.",
      );
      assert.equal(d.itens.length, 3);
    }
  });

  it("linha em BRANCO dentro da descrição não corta o item (vale a borda que deixa a célula simétrica)", () => {
    const a: ItemCenti = { n: "1", codigo: ["5241900001"], desc: ["PRIMEIRO ITEM LINHA 1", "PRIMEIRO ITEM LINHA 2", "", "PRIMEIRO ITEM LINHA 4", "", "PRIMEIRO ITEM LINHA 6"] };
    const b: ItemCenti = { n: "2", codigo: ["5241900002"], desc: ["SEGUNDO ITEM LINHA 1", "", "SEGUNDO ITEM LINHA 3", "SEGUNDO ITEM LINHA 4"] };
    const c: ItemCenti = { n: "3", codigo: ["5241900003"], desc: ["TERCEIRO", "", "", "TERCEIRO LINHA 4"] };
    for (const d of lerNasDuasVias([curto(9), a, b, c, curto(8)])) {
      assert.equal(d.itens.find((i) => i.item === 1)?.descricao, "PRIMEIRO ITEM LINHA 1 PRIMEIRO ITEM LINHA 2 PRIMEIRO ITEM LINHA 4 PRIMEIRO ITEM LINHA 6");
      assert.equal(d.itens.find((i) => i.item === 2)?.descricao, "SEGUNDO ITEM LINHA 1 SEGUNDO ITEM LINHA 3 SEGUNDO ITEM LINHA 4");
      assert.equal(d.itens.find((i) => i.item === 3)?.descricao, "TERCEIRO TERCEIRO LINHA 4");
      assert.equal(d.itens.find((i) => i.item === 9)?.descricao, "ITEM CURTO NÚMERO 9");
      assert.equal(d.itens.find((i) => i.item === 8)?.descricao, "ITEM CURTO NÚMERO 8");
    }
  });

  it("UNIDADE e VALORES quebrados em 2 linhas: junta antes de converter (não perde as casas decimais)", () => {
    const item: ItemCenti = {
      n: "1",
      codigo: ["5241900001"],
      desc: ["LOCAÇÃO DE EQUIPAMENTO", "DE VIGILÂNCIA"],
      unidade: ["SERVIÇO", "MENSAL"],
      qtd: ["12,0000"],
      vu: ["1.234.567,", "8912"],
      vt: ["14.814.814,", "6944"],
    };
    for (const d of lerNasDuasVias([item, curto(2)])) {
      const i1 = d.itens.find((i) => i.item === 1);
      assert.equal(i1?.unidade, "SERVIÇO MENSAL");
      assert.equal(i1?.quantidade, 12);
      assert.equal(i1?.valorUnitario, 1234567.8912);
      assert.equal(i1?.valorTotal, 14814814.6944);
    }
  });

  it("MUITOS itens em várias páginas + item enorme: todos lidos, nenhum vazamento (cabeçalho/rodapé repetidos pulados)", () => {
    const enorme: ItemCenti = { n: "40", codigo: ["524194727", "0"], desc: Array.from({ length: 30 }, (_, i) => `LINHA ${i + 1} DA ESPECIFICAÇÃO`) };
    const itens = [...Array.from({ length: 39 }, (_, i) => curto(i + 1)), enorme, ...Array.from({ length: 60 }, (_, i) => curto(i + 41))];
    for (const d of lerNasDuasVias(itens)) {
      assert.equal(d.itens.length, 100);
      assert.deepEqual(
        d.itens.map((i) => i.item),
        Array.from({ length: 100 }, (_, i) => i + 1),
      );
      assert.equal(d.itens[39].codigo, "5241947270");
      assert.equal(d.itens[39].descricao, Array.from({ length: 30 }, (_, i) => `LINHA ${i + 1} DA ESPECIFICAÇÃO`).join(" "));
      for (const it of d.itens.filter((i) => i.item !== 40)) assert.equal(it.descricao, `ITEM CURTO NÚMERO ${it.item}`);
    }
  });

  it("nº do item partido em 2 trechos ('1','2') = 12; o '12' do texto de apoio à margem NÃO vira item", () => {
    for (const semGrade of [false, true]) {
      const d = dfdCenti([curto(11), curto(12), curto(13)], { semGrade, apoio: [{ x: 38, str: "12" }, { x: 48, str: "MESES." }] });
      const partidos = d.items.flatMap((i) =>
        i.str === "12" && i.x > 40 ? [{ ...i, str: "1", w: 3.9 }, { ...i, x: i.x + 3.9, str: "2", w: 3.9 }] : [i],
      );
      const r = parseDfdFromPdfItems(partidos, "x.pdf", [], d.tracos);
      assert.deepEqual(
        r.itens.map((i) => i.item),
        [11, 12, 13],
      );
      assert.equal(r.itens[1].descricao, "ITEM CURTO NÚMERO 12");
      assert.equal(r.secoes.find((s) => s.numero === 4)?.texto, "12 MESES.");
    }
  });

  it("nº do item NÃO centrado sob o rótulo (outro emissor, alinhado à esquerda): os itens ainda são lidos", () => {
    const g = dfdCenti([curto(1), curto(2), curto(3)]);
    const aEsquerda = g.items.map((i) => (/^\d$/.test(i.str) && i.x > 40 && i.x < 60 ? { ...i, x: 38.5 } : i));
    for (const tracos of [g.tracos, []]) {
      const d = parseDfdFromPdfItems(aEsquerda, "x.pdf", [], tracos);
      assert.deepEqual(
        d.itens.map((i) => [i.item, i.descricao]),
        [
          [1, "ITEM CURTO NÚMERO 1"],
          [2, "ITEM CURTO NÚMERO 2"],
          [3, "ITEM CURTO NÚMERO 3"],
        ],
      );
    }
  });

  it("rodapé NÃO reconhecido entre páginas não derruba os itens das páginas seguintes", () => {
    const rodape = () => [{ x: 38, str: "SISTEMA DE GESTÃO — RELATÓRIO GERADO AUTOMATICAMENTE" }];
    const itens = Array.from({ length: 70 }, (_, i) => curto(i + 1));
    for (const d of lerNasDuasVias(itens, { rodape })) {
      assert.equal(d.itens.length, 70);
      assert.ok(d.itens.every((i) => i.descricao === `ITEM CURTO NÚMERO ${i.item}`));
    }
  });
});

describe("célula que atravessa a página (grade) e código que vira a página (geometria)", () => {
  const cab = (page: number, base: number): PdfItem[] => [
    t(page, 169.1, 762.8, "AQUISIÇÃO DE SERVIÇO Número DFD:777 / Planejamento: 1"),
    t(page, 48.3, base + 8.4, "ITEM"),
    t(page, 85, base + 8.4, "CÓDIGO"),
    t(page, 205.8, base + 8.4, "DESCRIÇÃO"),
    t(page, 345.5, base + 8.4, "UNIDADE"),
    t(page, 394.8, base + 8.4, "QUANTIDADE"),
    t(page, 507.3, base + 8.4, "VALOR TOTAL"),
    t(page, 457.9, base + 4.4, "UNITÁRIO"),
  ];
  const valores = (page: number, y: number): PdfItem[] => [t(page, 348, y, "UNIDADE"), t(page, 419.3, y, "1,0000"), t(page, 475.6, y, "5,0000"), t(page, 532.3, y, "5,0000")];
  const fim = (page: number, y: number): PdfItem[] => [t(page, 452.2, y, "VALOR TOTAL"), t(page, 38, y - 20, "5 - PREVISÃO DE ENTREGA/EXECUÇÃO"), t(page, 38, y - 34, "ANUAL")];

  it("GRADE: a cabeça da descrição no FIM da página (sem nº) junta-se ao item cujo nº está na página seguinte", () => {
    const items: PdfItem[] = [
      ...cab(1, 481),
      // item 1 (linha 481→461)
      t(1, 54.7, 468.8, "1"),
      t(1, 79.8, 468.8, "5241900001"),
      t(1, 123.1, 468.8, "ITEM UM"),
      ...valores(1, 468.8),
      // cabeça do item 2 no fim da página 1 (linha 461→60, sem nº: o nº ficou no meio da parte da página 2)
      ...Array.from({ length: 5 }, (_, i) => t(1, 123.1, 452 - i * 8.1, `CABEÇA ${i + 1}`)),
      ...cab(2, 714),
      t(2, 123.1, 705, "CORPO 1"),
      t(2, 54.7, 697, "2"),
      t(2, 79.8, 697, "5241900002"),
      t(2, 123.1, 697, "CORPO 2"),
      ...valores(2, 697),
      t(2, 123.1, 689, "CORPO 3"),
      t(2, 54.7, 668.8, "3"),
      t(2, 79.8, 668.8, "5241900003"),
      t(2, 123.1, 668.8, "ITEM TRÊS"),
      ...valores(2, 668.8),
      ...fim(2, 650),
    ];
    const tracos: PdfTraco[] = [...linhaDeCelulas(1, 481, 502.5), ...linhaDeCelulas(1, 461, 481), ...linhaDeCelulas(1, 60, 461)];
    tracos.push(...linhaDeCelulas(2, 714, 735.5), ...linhaDeCelulas(2, 682, 714), ...linhaDeCelulas(2, 661, 682));
    assert.equal(viaGrade(items, tracos), true);
    const d = parseDfdFromPdfItems(items, "x.pdf", [], tracos);
    assert.deepEqual(
      d.itens.map((i) => [i.item, i.codigo, i.descricao]),
      [
        [1, "5241900001", "ITEM UM"],
        [2, "5241900002", "CABEÇA 1 CABEÇA 2 CABEÇA 3 CABEÇA 4 CABEÇA 5 CORPO 1 CORPO 2 CORPO 3"],
        [3, "5241900003", "ITEM TRÊS"],
      ],
    );
  });

  it("GRADE: a cauda no TOPO da página seguinte (sem nº) continua o item anterior", () => {
    const items: PdfItem[] = [
      ...cab(1, 481),
      t(1, 123.1, 472.9, "INICIO 1"),
      t(1, 54.7, 464.8, "1"),
      t(1, 79.8, 464.8, "5241900001"),
      t(1, 123.1, 464.8, "INICIO 2"),
      ...valores(1, 464.8),
      t(1, 123.1, 456.7, "INICIO 3"),
      ...cab(2, 714),
      t(2, 123.1, 705, "CAUDA 1"),
      t(2, 123.1, 697, "CAUDA 2"),
      t(2, 54.7, 668.8, "2"),
      t(2, 79.8, 668.8, "5241900002"),
      t(2, 123.1, 668.8, "ITEM DOIS"),
      ...valores(2, 668.8),
      ...fim(2, 650),
    ];
    const tracos = [...linhaDeCelulas(1, 481, 502.5), ...linhaDeCelulas(1, 50, 481), ...linhaDeCelulas(2, 714, 735.5), ...linhaDeCelulas(2, 690, 714), ...linhaDeCelulas(2, 661, 690)];
    const d = parseDfdFromPdfItems(items, "x.pdf", [], tracos);
    assert.deepEqual(
      d.itens.map((i) => [i.item, i.descricao]),
      [
        [1, "INICIO 1 INICIO 2 INICIO 3 CAUDA 1 CAUDA 2"],
        [2, "ITEM DOIS"],
      ],
    );
  });

  it("GEOMETRIA (sem grade): o '0' do código que virou a página fica no item de cima — não vira zero à esquerda do próximo", () => {
    const items: PdfItem[] = [
      ...cab(1, 481),
      t(1, 123.1, 72.9, "EQUIPAMENTO DE VIGILÂNCIA"),
      t(1, 54.7, 64.8, "5"),
      t(1, 81.7, 64.8, "524194727"),
      t(1, 123.1, 64.8, "ELETRÔNICA COM MONITORAMENTO"),
      ...valores(1, 64.8),
      ...cab(2, 714),
      t(2, 97.3, 705.6, "0"),
      t(2, 123.1, 705.6, "REMOTO 24 HORAS"),
      t(2, 54.7, 690, "6"),
      t(2, 79.8, 690, "5241900006"),
      t(2, 123.1, 690, "ITEM SEIS"),
      ...valores(2, 690),
      ...fim(2, 670),
    ];
    const d = parseDfdFromPdfItems(items, "x.pdf");
    assert.deepEqual(
      d.itens.map((i) => [i.item, i.codigo, i.descricao]),
      [
        [5, "5241947270", "EQUIPAMENTO DE VIGILÂNCIA ELETRÔNICA COM MONITORAMENTO REMOTO 24 HORAS"],
        [6, "5241900006", "ITEM SEIS"],
      ],
    );
  });

  it("TOTAL ≥ R$ 10 mi QUEBRADO em 2 linhas: a grade segue valendo e o total/valores saem completos", () => {
    const grande: ItemCenti = { n: "2", codigo: ["524194727", "0"], desc: ["PAINEL DE LED", "OUTDOOR"], qtd: ["1,0000"], vu: ["14.814.814,", "6944"], vt: ["14.814.814,", "6944"] };
    for (const semGrade of [false, true]) {
      const d = dfdCenti([curto(1), grande, curto(3)], { total: "14.814.834,6944", semGrade });
      // O Centi quebra o total na célula mesclada: uma parte ACIMA e outra ABAIXO do rótulo (±½ entrelinha).
      const tot = d.items.find((i) => i.str === "14.814.834,6944") as PdfItem;
      d.items.splice(d.items.indexOf(tot), 1, t(tot.page, 517.9, tot.y + 4.05, "14.814.834,", 39.6), t(tot.page, 543.1, tot.y - 4.05, "6944", 14.4));
      // A parte de BAIXO do valor do item fica 0,02pt mais perto do nº (assimetria real do Centi).
      for (const f of d.items) if (f.str === "6944" && f.y > 400) f.y += 0.02;
      if (!semGrade) assert.equal(viaGrade(d.items, d.tracos), true);
      const r = parseDfdFromPdfItems(d.items, "x.pdf", [], d.tracos);
      const i2 = r.itens.find((i) => i.item === 2);
      assert.equal(i2?.valorUnitario, 14814814.6944, semGrade ? "texto" : "grade");
      assert.equal(i2?.valorTotal, 14814814.6944);
      assert.equal(i2?.codigo, "5241947270");
      assert.equal(r.valorTotal, 14814834.6944);
    }
  });

  it("GRADE: um risquinho vertical (carimbo achatado) no cabeçalho não vira borda de coluna nem apaga texto", () => {
    const x: ItemCenti = { n: "2", codigo: ["5241900002"], desc: ["LUMINÁRIA LED PARA ÁREA EXTERNA,", ["COMPATÍVEL", "• IP65 E IK08"], "GARANTIA DE 5 ANOS."] };
    const d = dfdCenti([curto(1), x, curto(3)]);
    const f = d.items.find((i) => i.str === "• IP65 E IK08") as PdfItem;
    f.x = 260; // 2º trecho de uma linha partida por TAB, dentro da célula da descrição
    d.tracos.push({ page: 1, o: "v", c: 250, a: 488.6, b: 489.4 }); // traço de 0,8pt sobre o cabeçalho
    assert.equal(viaGrade(d.items, d.tracos), true);
    const r = parseDfdFromPdfItems(d.items, "x.pdf", [], d.tracos);
    assert.equal(r.itens.find((i) => i.item === 2)?.descricao, "LUMINÁRIA LED PARA ÁREA EXTERNA, COMPATÍVEL IP65 E IK08 GARANTIA DE 5 ANOS.");
  });

  it("rodapé do Centi numa linha de base própria, longe da margem, é rodapé (não gruda no último item da página)", () => {
    const itens = Array.from({ length: 40 }, (_, i) => curto(i + 1));
    for (const semGrade of [false, true]) {
      const d = dfdCenti(itens, { semGrade });
      for (const f of d.items) if (/^Emitido em/.test(f.str)) f.y = 12.5;
      if (!semGrade) assert.equal(viaGrade(d.items, d.tracos), true);
      const r = parseDfdFromPdfItems(d.items, "x.pdf", [], d.tracos);
      assert.equal(r.itens.length, 40);
      assert.ok(r.itens.every((i, k) => i.descricao === `ITEM CURTO NÚMERO ${k + 1}`));
    }
  });

  it("linha da descrição que é só \"PÁGINA 12\" (referência a um documento) NÃO é rodapé — fica na descrição", () => {
    const x: ItemCenti = { n: "2", codigo: ["5241900002"], desc: ["CONFORME ESPECIFICADO NO EDITAL,", "PÁGINA 12", "ITEM 3."] };
    for (const d of lerNasDuasVias([curto(1), x, curto(3)])) {
      assert.equal(d.itens.find((i) => i.item === 2)?.descricao, "CONFORME ESPECIFICADO NO EDITAL, PÁGINA 12 ITEM 3.");
    }
  });

  it("GEOMETRIA: trecho da descrição depois de um TAB, à direita do meio entre os rótulos, continua descrição (não unidade)", () => {
    const x: ItemCenti = { n: "2", codigo: ["5241900002"], desc: ["LUMINÁRIA LED PARA ÁREA EXTERNA,", ["COMPATÍVEL COM AMBIENTE EXTERNO E", "• IP65"], "GARANTIA DE 5 ANOS."] };
    const d = dfdCenti([curto(1), x, curto(3)], { semGrade: true });
    const f = d.items.find((i) => i.str === "• IP65") as PdfItem;
    f.x = 275.7;
    const r = parseDfdFromPdfItems(d.items, "x.pdf");
    const i2 = r.itens.find((i) => i.item === 2);
    assert.equal(i2?.descricao, "LUMINÁRIA LED PARA ÁREA EXTERNA, COMPATÍVEL COM AMBIENTE EXTERNO E IP65 GARANTIA DE 5 ANOS.");
    assert.equal(i2?.unidade, "UNIDADE");
  });

  it("linha em BRANCO na cabeça do 1º item de uma página de continuação não vira borda (nas duas vias)", () => {
    const itens = [...Array.from({ length: 30 }, (_, i) => curto(i + 1)), { n: "31", codigo: ["5241900031"], desc: ["CABECA 1", "", "MEIO 3", "MEIO 4", "FIM 5"] }, curto(32)];
    for (const d of lerNasDuasVias(itens)) {
      assert.equal(d.itens.find((i) => i.item === 30)?.descricao, "ITEM CURTO NÚMERO 30");
      assert.equal(d.itens.find((i) => i.item === 31)?.descricao, "CABECA 1 MEIO 3 MEIO 4 FIM 5");
    }
  });

  it("grade que NÃO explica a tabela (borda faltando: 2 nºs numa célula) → cai na geometria do texto, sem perder nada", () => {
    const g = dfdCenti([curto(1), curto(2), curto(3)]);
    // Tira a borda entre os itens 1 e 2 (e as divisórias): os dois nºs ficam na mesma "linha" da grade.
    const ys = [...new Set(g.tracos.filter((x) => x.page === 1 && x.o === "h").map((x) => x.c))].sort((a, b) => b - a);
    const bordaEntre1e2 = ys[3]; // [topo cabeçalho, base cabeçalho = topo item 1, base item 1, …]
    const tracos = g.tracos.filter((x) => !(x.o === "h" && Math.abs(x.c - bordaEntre1e2) < 0.1));
    assert.equal(viaGrade(g.items, tracos), false);
    const d = parseDfdFromPdfItems(g.items, "x.pdf", [], tracos);
    assert.deepEqual(
      d.itens.map((i) => [i.item, i.descricao]),
      [
        [1, "ITEM CURTO NÚMERO 1"],
        [2, "ITEM CURTO NÚMERO 2"],
        [3, "ITEM CURTO NÚMERO 3"],
      ],
    );
  });
});
