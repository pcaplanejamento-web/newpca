import { parseNumberBR } from "./normalize.ts";
import {
  coletarSecoes,
  type DfdItemParseado,
  type DfdParseado,
  ehRuido,
  extrairAssinaturas,
  extrairCabecalho,
  extrairRefsDfd,
  norm,
  TITULO_SECAO_ITENS,
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

/** Normaliza os trechos (colapsa espaços) e descarta os vazios. */
function normalizar(bruto: PdfItem[]): PdfItem[] {
  return bruto
    .map((i) => ({ ...i, str: String(i.str ?? "").replace(/\s+/g, " ").trim() }))
    .filter((i) => i.str);
}

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

/**
 * Texto por linha (normalizado + agrupado por `y`) — mesma reconstrução usada no
 * parser. Reaproveitado pelo parser de PROTOCOLO para detectar o "Número DFD" de
 * cada página e fatiar o bundle em DFDs.
 */
export function linhasDeTexto(bruto: PdfItem[]): string[] {
  return agruparLinhas(normalizar(bruto)).map((l) => l.items.map((i) => i.str).join(" "));
}

/**
 * Índice do valor mais próximo de `target` num array **ordenado por `y` DESC**
 * (`ys`), via busca binária — O(log n). Empate = menor índice (maior `y`), igual
 * à varredura linear original. Destrava DFDs com milhares de itens (antes O(n²)).
 */
function nearestByY(ys: number[], target: number): number {
  let lo = 0;
  let hi = ys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ys[mid] <= target) hi = mid;
    else lo = mid + 1;
  }
  // O mais próximo num array monotônico é um dos vizinhos do ponto de inserção.
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  for (const i of [lo - 1, lo]) {
    if (i < 0 || i >= ys.length) continue;
    const d = Math.abs(ys[i] - target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function parseDfdFromPdfItems(bruto: PdfItem[], nomeArquivo: string): DfdParseado {
  const items = normalizar(bruto);
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
  let apoioSecao4 = ""; // texto de apoio abaixo da tabela (Seção 4)
  // Índice da linha onde a tabela ENCERRA (na próxima seção "5 - …" à margem
  // esquerda) — usado para dar ao `coletarSecoes` só as linhas FORA da tabela.
  let tableEndIdx = linhas.length;

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
    // INÍCIO REAL do texto da descrição: o conteúdo é alinhado à esquerda, bem à
    // esquerda do cabeçalho "DESCRIÇÃO" — então usamos o menor `x` de um fragmento
    // de TEXTO (com letra) na zona código→unidade. Um dígito à DIREITA disso é
    // conteúdo da descrição (ex.: nº de modelo "40300050630"), NÃO código.
    const codAnchor = anchors.codigo ?? 0;
    const uniAnchor = anchors.unidade ?? Number.POSITIVE_INFINITY;
    let descStartX = anchors.descricao ?? Number.POSITIVE_INFINITY;
    let minTexto = Number.POSITIVE_INFINITY;
    for (let k = hi + 1; k < linhas.length; k++) {
      for (const it of linhas[k].items) {
        if (it.x > codAnchor + 5 && it.x < uniAnchor && /[A-Za-zÀ-ÿ]/.test(it.str) && it.x < minTexto) {
          minTexto = it.x;
        }
      }
    }
    if (minTexto < Number.POSITIVE_INFINITY) descStartX = Math.min(descStartX, minTexto);

    const colOf = (x: number, str: string): keyof DfdItemParseado => {
      let idx = 0;
      for (let i = 0; i < cols.length - 1; i++) {
        const a = cols[i];
        const b = cols[i + 1];
        if (a && b && x >= (a.x + b.x) / 2) idx = i + 1;
      }
      let c: keyof DfdItemParseado = cols[idx]?.key ?? "descricao";
      // No vão código×descrição, dígitos puros = código; texto = descrição. Mas um
      // dígito na área da descrição (x ≥ início do texto) fica descrição — senão um
      // número no meio do texto vira "código" e o polui.
      if (c === "codigo" || c === "descricao") {
        c = /^\d+$/.test(str.trim()) && x < descStartX ? "codigo" : "descricao";
      }
      return c;
    };

    const ehNumItem = (it: PdfItem) => it.x < itemBound && /^\d+$/.test(it.str);
    // Cabeçalho de coluna repetido a cada página (não encerra a tabela).
    const ehCabecalhoColuna = (j: string) =>
      (/\bITEM\b/.test(j) && /QUANTIDADE/.test(j)) ||
      j === "VALOR" ||
      j === "UNITARIO" ||
      j === "VALOR UNITARIO" ||
      j === "VALOR TOTAL";
    // Próxima seção numerada ("5 - ...") encerra a Seção 4.
    const ehSecaoHeading = (j: string) => /^\d{1,2}\s*[-–—]\s/.test(j);

    const bodyFrags: PdfItem[] = [];
    const itemNums: { page: number; y: number; n: number }[] = [];
    const apoioLinhas: string[] = [];
    let fimTabela = false; // após a última linha de item vem o texto de apoio
    // Páginas cujo CABEÇALHO DE COLUNA já apareceu — acima dele (por página) fica o
    // CABEÇALHO DO DOCUMENTO repetido (ESTADO DE GOIÁS / <órgão> / DOCUMENTO… / Número
    // DFD / Tipo DFD), que deve ser pulado para não grudar na descrição de um item.
    const viuColuna = new Set<number>([linhas[hi].page]);

    // Varre TODAS as páginas do DFD (a tabela pode ocupar dezenas de páginas). O
    // cabeçalho do documento/coluna e o rodapé se REPETEM por página e são pulados
    // (nunca encerram a tabela); `y` reinicia por página → tudo é casado por página.
    for (let k = hi + 1; k < linhas.length; k++) {
      const l = linhas[k];
      const joined = norm(l.items.map((i) => i.str).join(" "));
      const minx = Math.min(...l.items.map((i) => i.x));
      const temNum = l.items.some(ehNumItem);

      // Só uma seção "N - …" À MARGEM ESQUERDA encerra a tabela; um "2-52" no MEIO de
      // uma descrição (indentado) NÃO é seção.
      if (minx < itemBound && ehSecaoHeading(joined)) {
        tableEndIdx = k;
        break;
      }
      if (ehCabecalhoColuna(joined)) {
        viuColuna.add(l.page);
        continue; // cabeçalho de coluna repetido por página
      }
      // Antes do cabeçalho de coluna DESTA página = cabeçalho do documento repetido → pula.
      if (!viuColuna.has(l.page)) continue;
      if (ehRuido(joined)) continue; // rodapé (Centi/Emitido/Página) e afins
      // Linha do TOTAL GERAL ("VALOR TOTAL" + número) — captura, mas NÃO encerra.
      if (/VALOR TOTAL/.test(joined) && !temNum) {
        const v = l.items.find((i) => colOf(i.x, i.str) === "valorTotal" && /\d/.test(i.str));
        if (v) valorTotalGrand = parseNumberBR(v.str);
        continue;
      }
      // Texto de apoio: prosa à margem esquerda (sem número de item) DEPOIS da tabela.
      if (fimTabela || (minx < itemBound && !temNum)) {
        fimTabela = true;
        apoioLinhas.push(l.items.map((i) => i.str).join(" "));
        continue;
      }
      // Linha de item.
      for (const it of l.items) {
        if (ehNumItem(it)) itemNums.push({ page: it.page, y: it.y, n: Number(it.str) });
        else bodyFrags.push(it);
      }
    }
    // Ordena por (página, y desc) — preserva a ordem real dos itens entre páginas.
    itemNums.sort((a, b) => a.page - b.page || b.y - a.y);
    apoioSecao4 = apoioLinhas.join(" ").replace(/\s+/g, " ").trim();

    type Bucket = { page: number; item: number; y: number; codigo: PdfItem[]; descricao: PdfItem[] } & {
      unidade: string | null;
      quantidade: number | null;
      valorUnitario: number | null;
      valorTotal: number | null;
    };
    const buckets: Bucket[] = itemNums.map((n) => ({
      page: n.page,
      item: n.n,
      y: n.y,
      codigo: [],
      descricao: [],
      unidade: null,
      quantidade: null,
      valorUnitario: null,
      valorTotal: null,
    }));

    // Índice de buckets POR PÁGINA (ys já em DESC dentro da página) → casa cada
    // fragmento ao item da MESMA página (o `y` reinicia entre páginas). Também guarda
    // o topo (maior `y` = 1º item) e o 1º índice de cada página para tratar
    // DESCRIÇÕES QUE ATRAVESSAM a página (continuam no topo da página seguinte).
    const idxPorPagina = new Map<number, { ys: number[]; bi: number[]; topo: number; first: number }>();
    buckets.forEach((b, i) => {
      const g = idxPorPagina.get(b.page);
      if (!g) idxPorPagina.set(b.page, { ys: [b.y], bi: [i], topo: b.y, first: i });
      else {
        g.ys.push(b.y);
        g.bi.push(i);
        if (b.y > g.topo) g.topo = b.y;
      }
    });
    for (const f of bodyFrags) {
      const g = idxPorPagina.get(f.page);
      const c = colOf(f.x, f.str);
      let b: Bucket | undefined;
      if (c === "descricao" && g && f.y > g.topo && g.first > 0) {
        // Descrição ACIMA de todos os itens da página = continuação do ÚLTIMO item da
        // página anterior (texto do item que "virou a página").
        b = buckets[g.first - 1];
      } else if (g && g.ys.length > 0) {
        b = buckets[g.bi[nearestByY(g.ys, f.y)]];
      }
      if (!b) continue;
      if (c === "codigo") b.codigo.push(f);
      else if (c === "descricao") b.descricao.push(f);
      else if (c === "unidade") {
        if (b.unidade == null) b.unidade = f.str;
      } else if (c === "quantidade" || c === "valorUnitario" || c === "valorTotal") {
        if (b[c] == null) b[c] = parseNumberBR(f.str);
      }
    }

    const porPos = (a: PdfItem, b: PdfItem) => a.page - b.page || b.y - a.y || a.x - b.x;
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
  // Seções: coleta APENAS as linhas FORA da tabela de itens ([hi, tableEndIdx)) —
  // senão o texto de um item (ex.: "…IEC 60601-2-52, SISTEMA DE GESTÃO…") viraria uma
  // "seção 2 - 52…". As seções 1/2/3 ficam antes do cabeçalho da tabela; 5/6/7/8/9
  // depois do fim da tabela. O apoio da Seção 4 (abaixo da tabela) é acrescentado.
  const linhasFora = hi >= 0 ? [...lineTexts.slice(0, hi), ...lineTexts.slice(tableEndIdx)] : lineTexts;
  const secoes = coletarSecoes(linhasFora);
  if (apoioSecao4) secoes.push({ numero: 4, titulo: TITULO_SECAO_ITENS, texto: apoioSecao4 });
  secoes.sort((a, b) => a.numero - b.numero);

  return {
    ...cab,
    ...extrairRefsDfd(secoes, cab.objeto),
    numero: cab.numero,
    valorTotal,
    nomeArquivo,
    secoes,
    itens,
    assinaturas: extrairAssinaturas(lineTexts),
  };
}
