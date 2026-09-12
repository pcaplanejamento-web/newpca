import { parseNumberBR } from "./normalize.ts";
import {
  coletarSecoes,
  type DfdItemParseado,
  type DfdParseado,
  extrairCabecalho,
  norm,
} from "./parse-dfd-comum.ts";

/**
 * Núcleo PURO do parser de DFD a partir do PDF. Recebe os TRECHOS de texto com
 * posição (`{page,x,y,str}`) extraídos pelo pdf.js (ver `parse-dfd-pdf.ts`) e
 * reconstrói a estrutura. O cabeçalho e as seções reaproveitam `parse-dfd-comum`;
 * a TABELA é remontada por posição de coluna, tratando os defeitos do PDF:
 * - rótulo e valor em trechos separados → usa o texto da LINHA (trechos juntos);
 * - o número do item fica na linha do MEIO da célula → cada trecho é atribuído ao
 *   item de número mais próximo em `y` (corrige ordem do código e vazamento de descrição);
 * - código quebrado em 2 linhas (ex.: "524193726" + "3") → rejuntado por `y`.
 * Sem pdf.js/D1 aqui → testável no Node com trechos sintéticos.
 */

export type PdfItem = { page: number; x: number; y: number; str: string };
type PdfLine = { page: number; y: number; items: PdfItem[] };

const HDR: Record<string, keyof ColMap> = {
  ITEM: "item",
  CODIGO: "codigo",
  DESCRICAO: "descricao",
  UNIDADE: "unidade",
  QUANTIDADE: "quantidade",
  QTD: "quantidade",
  "VALOR UNITARIO": "valorUnitario",
  UNITARIO: "valorUnitario",
  "VALOR TOTAL": "valorTotal",
};
type ColMap = Partial<Record<keyof DfdItemParseado, number>>;

/** Agrupa os trechos em linhas (mesma página + `y` dentro de 2pt), topo→base. */
function agruparLinhas(items: PdfItem[]): PdfLine[] {
  const ord = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const linhas: PdfLine[] = [];
  let cur: PdfLine | null = null;
  for (const it of ord) {
    if (cur && cur.page === it.page && Math.abs(cur.y - it.y) <= 2) cur.items.push(it);
    else {
      cur = { page: it.page, y: it.y, items: [it] };
      linhas.push(cur);
    }
  }
  return linhas;
}

export function parseDfdFromPdfItems(bruto: PdfItem[], nomeArquivo: string): DfdParseado {
  const items = bruto
    .map((i) => ({ ...i, str: String(i.str ?? "").replace(/\s+/g, " ").trim() }))
    .filter((i) => i.str);
  const linhas = agruparLinhas(items);
  const lineTexts = linhas.map((l) => l.items.map((i) => i.str).join(" "));

  const cab = extrairCabecalho(lineTexts);

  // ---- Tabela (Seção 4) por posição de coluna ----
  const hi = linhas.findIndex(
    (l) =>
      l.items.some((i) => norm(i.str) === "ITEM") &&
      l.items.some((i) => /QUANTIDADE/.test(norm(i.str))),
  );

  const itens: DfdItemParseado[] = [];
  let valorTotalGrand: number | null = null;

  if (hi >= 0) {
    // Âncoras (x) de cada coluna — "VALOR UNITÁRIO" pode vir só como "UNITÁRIO"
    // numa 2ª linha do cabeçalho.
    const anchors: ColMap = {};
    for (const off of [0, 1, -1]) {
      const l = linhas[hi + off];
      if (!l) continue;
      for (const it of l.items) {
        const k = HDR[norm(it.str)];
        if (k && anchors[k] == null) anchors[k] = it.x;
      }
    }
    // Colunas presentes com sua âncora `x` (na ordem esperada).
    const cols = (
      ["item", "codigo", "descricao", "unidade", "quantidade", "valorUnitario", "valorTotal"] as const
    )
      .map((key) => ({ key, x: anchors[key] }))
      .filter((c): c is { key: keyof DfdItemParseado; x: number } => c.x != null);
    const [c0, c1] = cols;
    const itemBound = c0 && c1 ? (c0.x + c1.x) / 2 : 70;

    const colOf = (x: number, str: string): keyof DfdItemParseado => {
      let idx = 0;
      for (let i = 0; i < cols.length - 1; i++) {
        const a = cols[i];
        const b = cols[i + 1];
        if (a && b && x >= (a.x + b.x) / 2) idx = i + 1;
      }
      let c: keyof DfdItemParseado = cols[idx]?.key ?? "descricao";
      // no vão código×descrição, dígitos puros = código; texto = descrição.
      if (c === "codigo" || c === "descricao") c = /^\d+$/.test(str.trim()) ? "codigo" : "descricao";
      return c;
    };

    const ehNumItem = (it: PdfItem) => it.x < itemBound && /^\d+$/.test(it.str);
    const bodyFrags: PdfItem[] = [];
    const itemNums: { y: number; n: number }[] = [];
    for (let k = hi + 1; k < linhas.length; k++) {
      const l = linhas[k];
      const joined = norm(l.items.map((i) => i.str).join(" "));
      const minx = Math.min(...l.items.map((i) => i.x));
      const temNum = l.items.some(ehNumItem);
      if (/VALOR TOTAL/.test(joined) && !temNum) {
        const v = l.items.find((i) => colOf(i.x, i.str) === "valorTotal");
        valorTotalGrand = v ? parseNumberBR(v.str) : null;
        break;
      }
      if (minx < 46) break; // saiu da tabela (nota/seção à margem esquerda)
      for (const it of l.items) {
        if (ehNumItem(it)) itemNums.push({ y: it.y, n: Number(it.str) });
        else bodyFrags.push(it);
      }
    }
    itemNums.sort((a, b) => b.y - a.y);

    type Bucket = { item: number; y: number; codigo: PdfItem[]; descricao: PdfItem[] } & {
      unidade: string | null;
      quantidade: number | null;
      valorUnitario: number | null;
      valorTotal: number | null;
    };
    const buckets: Bucket[] = itemNums.map((n) => ({
      item: n.n,
      y: n.y,
      codigo: [],
      descricao: [],
      unidade: null,
      quantidade: null,
      valorUnitario: null,
      valorTotal: null,
    }));

    for (const f of bodyFrags) {
      if (buckets.length === 0) break;
      let bi = 0;
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < buckets.length; i++) {
        const d = Math.abs(buckets[i].y - f.y);
        if (d < best) {
          best = d;
          bi = i;
        }
      }
      const b = buckets[bi];
      const c = colOf(f.x, f.str);
      if (c === "codigo") b.codigo.push(f);
      else if (c === "descricao") b.descricao.push(f);
      else if (c === "unidade") {
        if (b.unidade == null) b.unidade = f.str;
      } else if (c === "quantidade" || c === "valorUnitario" || c === "valorTotal") {
        if (b[c] == null) b[c] = parseNumberBR(f.str);
      }
    }

    const porPos = (a: PdfItem, b: PdfItem) => b.y - a.y || a.x - b.x;
    for (const b of buckets) {
      itens.push({
        item: b.item,
        codigo: b.codigo.sort(porPos).map((f) => f.str).join("") || null,
        descricao:
          b.descricao
            .sort(porPos)
            .map((f) => f.str)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim() || null,
        unidade: b.unidade,
        quantidade: b.quantidade,
        valorUnitario: b.valorUnitario,
        valorTotal: b.valorTotal,
      });
    }
  }

  const somaItens = itens.reduce((s, it) => s + (it.valorTotal ?? 0), 0);
  const valorTotal = valorTotalGrand ?? (somaItens > 0 ? Math.round(somaItens * 100) / 100 : null);

  if (!cab.numero) {
    throw new Error(
      'Não encontrei o "Número DFD" no PDF. Confira se é um DFD emitido (PDF com texto).',
    );
  }
  if (itens.length === 0) {
    throw new Error(
      "Não encontrei itens na Seção 4 do PDF (ITEM / CÓDIGO / DESCRIÇÃO / UNIDADE / QUANTIDADE).",
    );
  }

  return {
    ...cab,
    numero: cab.numero,
    valorTotal,
    nomeArquivo,
    secoes: coletarSecoes(lineTexts),
    itens,
  };
}
