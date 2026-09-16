import { norm } from "./parse-dfd-comum.ts";
import { agruparLinhas, nearestByY, normalizar, type PdfItem, type PdfLine } from "./parse-dfd-pdf-core.ts";

/**
 * Núcleo PURO do parser de CATÁLOGO de produtos a partir do PDF. Recebe os TRECHOS de
 * texto com posição (`{page,x,y,str}`, extraídos pelo pdf.js) e reconstrói a tabela de
 * itens — CÓDIGO, DESCRIÇÃO, UNIDADE de medida (+ Nº de item OPCIONAL). Diferente do
 * parser de DFD (colunas FIXAS), aqui as colunas são detectadas pelo CABEÇALHO e
 * ordenadas por POSIÇÃO, porque os catálogos variam muito: 3 a 7 colunas, ordem
 * diferente (Und antes/depois da descrição, ou 2x), com/sem Nº de item, colunas
 * Qtd/Valor vazias, e 1ª página com cabeçalho de documento (logo/endereço/título)
 * acima da tabela. Cada LINHA é ancorada no CÓDIGO (todo item tem um; nem todo tem Nº).
 * Reaproveita `agruparLinhas`/`nearestByY`/`normalizar` do parser de DFD. Sem pdf.js/D1
 * aqui → testável no Node com trechos sintéticos.
 */

export type CatalogoItemParseado = {
  sequencial: number | null;
  codigo: string; // normalizado (só dígitos)
  codigoRaw: string | null; // forma original do PDF (ex.: "524.175.984")
  descricao: string;
  unidade: string | null;
};

export type CatalogoParseado = {
  nome: string | null; // título "CATÁLOGO ..." sugerido (editável no envio)
  itens: CatalogoItemParseado[];
  duplicadosNoArquivo: string[]; // códigos repetidos no próprio arquivo
};

type ColKey = "item" | "codigo" | "descricao" | "unidade";
type Coluna = { key: ColKey; x: number };

/** Classifica um TOKEN de cabeçalho numa coluna (ou null). Qtd/Valor/Unitário são
 * IGNORADOS (não viram coluna) — costumam vir vazios. */
function rotuloColuna(str: string): ColKey | null {
  const s = norm(str); // UPPER + sem acento + espaços colapsados
  if (/QUANT|QTD|VALOR|UNIT|TOTAL|PRECO/.test(s)) return null;
  if (/^COD/.test(s)) return "codigo"; // COD, CODIGO, "COD PRODUTO", "COD. PROD"
  if (/^DESCRI/.test(s)) return "descricao";
  if (/^UN(D|ID)/.test(s) || /^MED/.test(s)) return "unidade"; // UND, UNID, UNIDADE, UND.MED, MEDIDA
  if (/^ITEM/.test(s) || /SEQ/.test(s)) return "item"; // ITEM, "Nº Seq"
  return null;
}

/** Uma linha é cabeçalho de coluna se tem um rótulo de CÓDIGO e um de DESCRIÇÃO. */
function linhaEhCabecalho(l: PdfLine): boolean {
  let cod = false;
  let desc = false;
  for (const it of l.items) {
    const r = rotuloColuna(it.str);
    if (r === "codigo") cod = true;
    else if (r === "descricao") desc = true;
  }
  return cod && desc;
}

/** Âncoras (x) das colunas: varre o cabeçalho + a linha seguinte (rótulos que quebram
 * em 2 linhas, ex.: "Cod"/"Produto", "UNIDADE"/"DE MEDIDA"). Mantém a 1ª ocorrência de
 * item/codigo/descricao; para UNIDADE mantém TODAS (Und pode vir 2x — Construção).
 * Ordena por x. */
function colunas(linhas: PdfLine[], hi: number): Coluna[] {
  const cols: Coluna[] = [];
  const vistos = new Set<ColKey>();
  for (const off of [0, 1]) {
    const l = linhas[hi + off];
    if (!l) continue;
    for (const it of l.items) {
      const key = rotuloColuna(it.str);
      if (!key) continue;
      if (key === "unidade") {
        if (!cols.some((c) => c.key === "unidade" && Math.abs(c.x - it.x) < 6)) cols.push({ key, x: it.x });
      } else if (!vistos.has(key)) {
        vistos.add(key);
        cols.push({ key, x: it.x });
      }
    }
  }
  return cols.sort((a, b) => a.x - b.x);
}

/** Coluna de um fragmento pela posição x (fronteira = ponto médio entre colunas). */
function colOf(cols: Coluna[], x: number): ColKey {
  let idx = 0;
  for (let i = 0; i < cols.length - 1; i++) {
    if (x >= (cols[i].x + cols[i + 1].x) / 2) idx = i + 1;
  }
  return cols[idx]?.key ?? "descricao";
}

/** Título "CATÁLOGO ..." antes do cabeçalho (nome sugerido); `null` se não houver. */
function tituloDe(linhas: PdfLine[], ate: number): string | null {
  for (let k = 0; k < ate && k < linhas.length; k++) {
    const txt = linhas[k].items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
    if (/CATAL[AO]GO/.test(norm(txt))) return txt; // "CATÁLOGO" e a variante "CATÁLAGO"
  }
  return null;
}

/** Monta a unidade de um item: agrupa por coluna (Und pode vir 2x — pega a mais longa)
 * e junta verticalmente cada coluna (célula que quebra em 2 linhas, ex.: "UNIDA"/"DE"). */
function montarUnidade(frags: PdfItem[]): string | null {
  if (frags.length === 0) return null;
  const grupos: PdfItem[][] = [];
  for (const f of [...frags].sort((a, b) => a.x - b.x)) {
    const g = grupos.find((gr) => Math.abs(gr[0].x - f.x) < 12);
    if (g) g.push(f);
    else grupos.push([f]);
  }
  const cands = grupos
    .map((g) =>
      g
        .sort((a, b) => b.y - a.y || a.x - b.x)
        .map((f) => f.str)
        .join("")
        .replace(/\s+/g, "")
        .trim(),
    )
    .filter(Boolean);
  if (cands.length === 0) return null;
  cands.sort((a, b) => b.length - a.length);
  return cands[0] || null;
}

const porPos = (a: PdfItem, b: PdfItem) => a.page - b.page || b.y - a.y || a.x - b.x;

export function parseCatalogoFromPdfItems(bruto: PdfItem[], _nomeArquivo: string): CatalogoParseado {
  const items = normalizar(bruto);
  const linhas = agruparLinhas(items);
  const hi = linhas.findIndex(linhaEhCabecalho);
  if (hi < 0) return { nome: tituloDe(linhas, linhas.length), itens: [], duplicadosNoArquivo: [] };

  const cols = colunas(linhas, hi);
  const nome = tituloDe(linhas, hi);

  // Varre as páginas (a tabela pode ocupar dezenas). Na 1ª página o cabeçalho do
  // documento (logo/endereço/título) fica ACIMA do cabeçalho de coluna → excluído por
  // começar em `hi+1`. Nos catálogos o cabeçalho de coluna NÃO se repete por página
  // (dado começa no topo), mas, por segurança, uma linha que SEJA cabeçalho é pulada.
  // Uma linha tem CÓDIGO (dado real) se tem um token numérico na coluna do código;
  // tem PROSA (descrição) se tem texto com letra na coluna da descrição.
  const temCodigo = (l: PdfLine) => l.items.some((it) => colOf(cols, it.x) === "codigo" && /\d/.test(it.str));
  const temProsa = (l: PdfLine) => l.items.some((it) => colOf(cols, it.x) === "descricao" && /[A-Za-zÀ-ÿ]/.test(it.str));

  const codFrags: PdfItem[] = [];
  const descFrags: PdfItem[] = [];
  const uniFrags: PdfItem[] = [];
  const itemFrags: PdfItem[] = [];
  // Enquanto os DADOS não começam, pula as linhas de CONTINUAÇÃO do cabeçalho (ex.:
  // "DE MEDIDA", "Produto", "Medida" — cabeçalho de 2 linhas) que não são código nem
  // prosa. Depois do 1º item, processa tudo (inclusive descrição/unidade que quebram
  // em várias linhas). Um cabeçalho de coluna repetido por página também é pulado.
  let dataComecou = false;
  for (let k = hi + 1; k < linhas.length; k++) {
    const l = linhas[k];
    if (linhaEhCabecalho(l)) continue;
    if (!dataComecou) {
      if (temCodigo(l) || temProsa(l)) dataComecou = true;
      else continue;
    }
    for (const it of l.items) {
      let c = colOf(cols, it.x);
      if (c === "codigo" && !/\d/.test(it.str)) c = "descricao"; // texto sem dígito na coluna do código = descrição
      if (c === "codigo") codFrags.push(it);
      else if (c === "unidade") uniFrags.push(it);
      else if (c === "item") itemFrags.push(it);
      else descFrags.push(it);
    }
  }

  // Cada CÓDIGO (agrupado por página + y) é uma linha/item. `codFrags` já vem de
  // `linhas` → varrido em ordem; reagrupa por y para juntar um código em 2 tokens.
  type Bucket = { page: number; y: number; cod: PdfItem[]; desc: PdfItem[]; uni: PdfItem[]; seq: PdfItem[] };
  const buckets: Bucket[] = [];
  const ord = [...codFrags].sort(porPos);
  let cur: Bucket | null = null;
  for (const f of ord) {
    if (cur && cur.page === f.page && Math.abs(cur.y - f.y) <= 2) cur.cod.push(f);
    else {
      cur = { page: f.page, y: f.y, cod: [f], desc: [], uni: [], seq: [] };
      buckets.push(cur);
    }
  }

  // Índice de buckets POR PÁGINA (ys em DESC) → casa cada fragmento ao item da mesma
  // página; guarda o topo e o 1º índice p/ descrições que ATRAVESSAM a página.
  const idxPag = new Map<number, { ys: number[]; bi: number[]; topo: number; first: number }>();
  buckets.forEach((b, i) => {
    const g = idxPag.get(b.page);
    if (!g) idxPag.set(b.page, { ys: [b.y], bi: [i], topo: b.y, first: i });
    else {
      g.ys.push(b.y);
      g.bi.push(i);
      if (b.y > g.topo) g.topo = b.y;
    }
  });
  const attach = (f: PdfItem, alvo: "desc" | "uni" | "seq") => {
    const g = idxPag.get(f.page);
    let b: Bucket | undefined;
    if (alvo === "desc" && g && f.y > g.topo && g.first > 0) b = buckets[g.first - 1];
    else if (g && g.ys.length > 0) b = buckets[g.bi[nearestByY(g.ys, f.y)]];
    if (b) b[alvo].push(f);
  };
  for (const f of descFrags) attach(f, "desc");
  for (const f of uniFrags) attach(f, "uni");
  for (const f of itemFrags) attach(f, "seq");

  const itens: CatalogoItemParseado[] = [];
  for (const b of buckets) {
    const codigoRaw = b.cod.sort(porPos).map((f) => f.str).join("").trim() || null;
    const codigo = (codigoRaw ?? "").replace(/\D/g, "");
    if (!codigo) continue; // sem código numérico → não é um item
    const descricao = b.desc
      .sort(porPos)
      .map((f) => f.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const seqStr = b.seq.sort(porPos).map((f) => f.str).join("");
    const sequencial = /^\d+$/.test(seqStr) ? Number(seqStr) : null;
    itens.push({ sequencial, codigo, codigoRaw, descricao, unidade: montarUnidade(b.uni) });
  }

  const vistos = new Set<string>();
  const dups = new Set<string>();
  for (const it of itens) {
    if (vistos.has(it.codigo)) dups.add(it.codigo);
    else vistos.add(it.codigo);
  }

  return { nome, itens, duplicadosNoArquivo: [...dups] };
}
