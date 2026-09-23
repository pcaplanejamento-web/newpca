import type { PdfTraco } from "../../src/lib/grade-pdf.ts";
import type { PdfItem } from "../../src/lib/parse-dfd-pdf-core.ts";

/**
 * Gerador de DFD no LEIAUTE EXATO do Centi (medidas tiradas do PDF real pd101820): trechos de texto como o
 * pdf.js entrega (x, y da linha de base, largura `w`, corpo `h`=7) + os TRAÇOS da grade (cada célula é um
 * retângulo desenhado). Colunas: ITEM 35,4–78 · CÓDIGO 78–120,5 · DESCRIÇÃO 120,5–333,1 · UNIDADE 333,1–389,8 ·
 * QUANTIDADE 389,8–446,5 · VALOR UNITÁRIO 446,5–503,2 · VALOR TOTAL 503,2–559,9. Entrelinha 8,1; tudo
 * CENTRALIZADO na célula na vertical (nº/código/valores no meio; descrição acima e abaixo do nº); código e
 * unidade centralizados na horizontal, valores à direita, descrição à esquerda (x=123,1). A linha que não cabe
 * na página vai inteira para a próxima (cabeçalho do documento e de coluna repetidos).
 */
export const COLS = [35.4, 78, 120.5, 333.1, 389.8, 446.5, 503.2, 559.9];
const ENTRELINHA = 8.1;
const H = 7;
const largura = (s: string, porCar = 3.9) => s.length * porCar;

export type ItemCenti = {
  n: string;
  /** Linhas do código (quebrado quando não cabe: "524194727", "0"). */
  codigo: string[];
  /** Linhas da descrição; cada linha pode ter VÁRIOS trechos (tab/marcador partem a linha no PDF). */
  desc: (string | string[])[];
  unidade?: string[];
  qtd?: string[];
  vu?: string[];
  vt?: string[];
};

export type OpcoesCenti = {
  numero?: string;
  /** Sem os traços (PDF sem grade) → o parser usa a geometria do texto. */
  semGrade?: boolean;
  /** Texto das seções depois da tabela (x, y relativos são gerados). */
  secoesDepois?: { x: number; str: string }[];
  /** Base mínima da tabela na página (abaixo disso a linha vai para a próxima página). */
  fundoPagina?: number;
  /** Rodapé de cada página (padrão = rodapé do Centi). */
  rodape?: (page: number) => { x: number; str: string }[];
  /** Total geral (texto na coluna VALOR TOTAL). */
  total?: string;
  /** Texto de apoio abaixo da tabela (trechos na margem). */
  apoio?: { x: number; str: string }[];
};

/** Trecho de texto como o pdf.js entrega (largura estimada, corpo 7). */
export const t = (page: number, x: number, y: number, str: string, w = largura(str)): PdfItem => ({ page, x, y, str, w, h: H });

export function retangulo(page: number, x0: number, x1: number, y0: number, y1: number): PdfTraco[] {
  return [
    { page, o: "h", c: y0, a: x0, b: x1 },
    { page, o: "h", c: y1, a: x0, b: x1 },
    { page, o: "v", c: x0, a: y0, b: y1 },
    { page, o: "v", c: x1, a: y0, b: y1 },
  ];
}
/** Uma LINHA da tabela desenhada: as 7 células (retângulos) entre `base` e `topo`. */
export const linhaDeCelulas = (page: number, base: number, topo: number) => COLS.slice(0, -1).flatMap((x, i) => retangulo(page, x, COLS[i + 1], base, topo));

export function dfdCenti(itens: ItemCenti[], op: OpcoesCenti = {}): { items: PdfItem[]; tracos: PdfTraco[] } {
  const numero = op.numero ?? "9999";
  const items: PdfItem[] = [];
  const tracos: PdfTraco[] = [];
  const fundo = op.fundoPagina ?? 47;
  const rodape = op.rodape ?? ((p: number) => [
    { x: 38, str: `Centi ® e-Assinatura: AbC${p}dZ58teX` },
    { x: 221.8, str: "Emitido em 30/06/2026 09:43 por fernanda.mello" },
    { x: 514.3, str: `Página ${p} de 9` },
  ]);
  const cabecalhoDoc = (page: number) => {
    items.push(t(page, 263.5, 805.4, "ESTADO DE GOIÁS"));
    items.push(t(page, 173.3, 791.3, "FUNDO MUNICIPAL DE ASSISTENCIA SOCIAL DE RIO VERDE"));
    items.push(t(page, 184.7, 776.8, "DOCUMENTO DE FORMALIZAÇÃO DA DEMANDA - DFD"));
    items.push(t(page, 169.1, 762.8, `AQUISIÇÃO DE SERVIÇO Número DFD:${numero} / Planejamento: 1`));
    for (const r of rodape(page)) items.push(t(page, r.x, 20.8, r.str));
    tracos.push(...retangulo(page, 0, 595.3, 0, 841.9)); // fundo branco da página
  };
  // Cabeçalho de coluna (linha da grade [base, base+21,5]).
  const cabecalhoCol = (page: number, base: number) => {
    const y = base + 8.4;
    items.push(t(page, 48.3, y, "ITEM"), t(page, 85, y, "CÓDIGO"), t(page, 205.8, y, "DESCRIÇÃO"), t(page, 345.5, y, "UNIDADE"));
    items.push(t(page, 394.8, y, "QUANTIDADE"), t(page, 507.3, y, "VALOR TOTAL"), t(page, 462.9, y + 4, "VALOR"), t(page, 457.9, y - 4, "UNITÁRIO"));
    tracos.push(...linhaDeCelulas(page, base, base + 21.5));
  };

  let page = 1;
  cabecalhoDoc(1);
  items.push(t(1, 38, 745, "Tipo DFD: DFD-S — Solução / com ETP"));
  items.push(t(1, 38, 720, "1 - ÁREA REQUISITANTE DA DEMANDA"));
  items.push(t(1, 38, 706, "Setor Requisitante: SMAS - SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL"));
  items.push(t(1, 38, 680, "3 - JUSTIFICATIVA DA NECESSIDADE DA AQUISIÇÃO"));
  items.push(t(1, 38, 666, "ATENDER A DEMANDA DA SECRETARIA."));
  items.push(t(1, 38, 507.1, "4 - QUANTIDADE DE MATERIAL/SERVIÇOS A SER CONTRATADA"));
  cabecalhoCol(1, 481);
  let topo = 481;
  for (const it of itens) {
    const L = Math.max(it.desc.length, it.codigo.length, it.unidade?.length ?? 1, 1);
    const altura = Math.max(14.2, L * ENTRELINHA + 3.8);
    if (topo - altura < fundo) {
      page++;
      cabecalhoDoc(page);
      cabecalhoCol(page, 714);
      topo = 714;
    }
    const base = topo - altura;
    const meio = (topo + base) / 2 - 2.2; // linha de base do nº (centro da célula)
    const linhaY = (i: number, qtd: number) => meio + ((qtd - 1) / 2 - i) * ENTRELINHA;
    items.push(t(page, 56.7 - largura(it.n) / 2, meio, it.n));
    for (const [i, c] of it.codigo.entries()) items.push(t(page, 99.25 - largura(c) / 2, linhaY(i, it.codigo.length), c));
    it.desc.forEach((d, i) => {
      let x = 123.1;
      for (const parte of Array.isArray(d) ? d : [d]) {
        items.push(t(page, x, linhaY(i, it.desc.length), parte));
        x += largura(parte, 4.2) + 14; // trecho seguinte depois de um vão (tab)
      }
    });
    const unidade = it.unidade ?? ["UNIDADE"];
    for (const [i, u] of unidade.entries()) items.push(t(page, 361.45 - largura(u, 5) / 2, linhaY(i, unidade.length), u, largura(u, 5)));
    const direita = (xFim: number, vs: string[] | undefined, padrao: string) => {
      const l = vs ?? [padrao];
      for (const [i, v] of l.entries()) items.push(t(page, xFim - largura(v, 3.6), linhaY(i, l.length), v, largura(v, 3.6)));
    };
    direita(444.1, it.qtd, "1,0000");
    direita(500.8, it.vu, "10,0000");
    direita(557.5, it.vt, "10,0000");
    tracos.push(...linhaDeCelulas(page, base, topo));
    topo = base;
  }
  // Total geral: célula do rótulo MESCLADA (sem as divisórias internas) + célula do valor.
  const baseTotal = topo - 14;
  items.push(t(page, 452.2, baseTotal + 4.8, "VALOR TOTAL"));
  if (op.total) items.push(t(page, 557.5 - largura(op.total, 3.6), baseTotal + 4.8, op.total, largura(op.total, 3.6)));
  tracos.push(...retangulo(page, 35.4, 503.2, baseTotal, topo), ...retangulo(page, 503.2, 559.9, baseTotal, topo));
  let y = baseTotal - 14;
  for (const a of op.apoio ?? [{ x: 38, str: "12 MESES." }]) {
    items.push(t(page, a.x, y, a.str));
  }
  y -= 21;
  items.push(t(page, 38, y, "5 - PREVISÃO DE ENTREGA/EXECUÇÃO"));
  items.push(t(page, 38, y - 14, "JANEIRO/2027"));
  y -= 35;
  for (const s of op.secoesDepois ?? []) {
    items.push(t(page, s.x, y, s.str));
    y -= 14;
  }
  return { items, tracos: op.semGrade ? [] : tracos };
}
