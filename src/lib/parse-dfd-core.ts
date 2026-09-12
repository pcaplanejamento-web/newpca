import { parseIntBR, parseNumberBR, stripAccents } from "./normalize.ts";

/**
 * Núcleo PURO do parser de DFD (Documento de Formalização da Demanda).
 *
 * Recebe uma matriz de células (array de arrays, texto formatado — ver
 * `parse-dfd.ts`) e extrai TODAS as informações do formulário: metadados do
 * cabeçalho (Seção 1), a tabela de itens da Seção 4 (com valores, quando houver)
 * e o texto das demais seções numeradas (2, 3, 5, 6, 7, 8, 9…). Sem SheetJS e sem
 * D1 → testável isoladamente no Node.
 */

export type DfdSecao = { numero: number; titulo: string; texto: string };

export type DfdItemParseado = {
  item: number | null;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
};

export type DfdParseado = {
  numero: string;
  planejamento: string | null;
  tipo: string | null;
  objeto: string | null;
  orgaoEntidade: string | null;
  setorRequisitante: string | null;
  siglaSetor: string | null;
  responsavel: string | null;
  matricula: string | null;
  email: string | null;
  telefone: string | null;
  valorEstimado: number | null; // da nota "R$ ..." (Seção 4)
  valorTotal: number | null; // total da tabela (soma dos itens / linha "VALOR TOTAL")
  nomeArquivo: string;
  secoes: DfdSecao[];
  itens: DfdItemParseado[];
};

/** UPPER + sem acento + espaços colapsados (p/ casar rótulos/cabeçalhos). */
function norm(v: unknown): string {
  return stripAccents(
    String(v ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase(),
  );
}

function txt(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** Primeira célula não-vazia da linha (para detectar seção/rótulo). */
function primeiraCelula(row: unknown[]): string {
  for (const c of row) {
    const t = txt(c);
    if (t) return t;
  }
  return "";
}

// Cabeçalho da tabela de itens (Seção 4). Chave = norm da célula.
const CABECALHO_ITEM: Record<string, keyof ColMap> = {
  ITEM: "item",
  CODIGO: "codigo",
  DESCRICAO: "descricao",
  UNIDADE: "unidade",
  QUANTIDADE: "quantidade",
  QTD: "quantidade",
  QTDE: "quantidade",
  "VALOR UNITARIO": "valorUnitario",
  "VL UNITARIO": "valorUnitario",
  "VALOR UNIT": "valorUnitario",
  "VALOR TOTAL": "valorTotal",
  "VL TOTAL": "valorTotal",
};

type ColMap = {
  item?: number;
  codigo?: number;
  descricao?: number;
  unidade?: number;
  quantidade?: number;
  valorUnitario?: number;
  valorTotal?: number;
};

/** Primeiro grupo capturado não-vazio ao aplicar `re` a alguma célula. */
function buscar(cells: string[], re: RegExp): string | null {
  for (const s of cells) {
    const m = s.match(re);
    const v = m?.[1]?.trim();
    if (v) return v;
  }
  return null;
}

const RE_VALOR = /R\$\s*([\d.]+,\d{2})/;

/** Ruído de cabeçalho/rodapé repetido nas quebras de página (não é conteúdo). */
function ehRuido(s: string): boolean {
  const n = norm(s);
  return (
    n.startsWith("CENTI") ||
    n.startsWith("EMITIDO EM") ||
    n.startsWith("PAGINA ") ||
    n === "ESTADO DE GOIAS" ||
    n === "PREFEITURA MUNICIPAL DE RIO VERDE" ||
    n.startsWith("DOCUMENTO DE FORMALIZACAO") ||
    /NUMERO DFD/.test(n) ||
    n.startsWith("TIPO DFD")
  );
}

/**
 * Coleta as SEÇÕES numeradas ("N - TÍTULO" + texto abaixo). Pula a Seção 1 (área
 * requisitante — vira campos estruturados) e a Seção 4 (tabela de itens). O texto
 * de cada seção junta as linhas até a próxima seção, ignorando o ruído de página.
 */
function coletarSecoes(aoa: unknown[][]): DfdSecao[] {
  const brutas: { numero: number; titulo: string; linhas: string[] }[] = [];
  let atual: { numero: number; titulo: string; linhas: string[] } | null = null;
  for (const row of aoa) {
    const cell = primeiraCelula(row ?? []);
    if (!cell) continue;
    const m = cell.match(/^(\d{1,2})\s*[-–—]\s*(.+)$/);
    if (m) {
      atual = { numero: Number(m[1]), titulo: m[2].trim(), linhas: [] };
      brutas.push(atual);
      continue;
    }
    if (atual && !ehRuido(cell)) atual.linhas.push(cell);
  }
  return brutas
    .filter((s) => s.numero !== 1 && s.numero !== 4)
    .map((s) => ({ numero: s.numero, titulo: s.titulo, texto: s.linhas.join("\n").trim() }))
    .filter((s) => s.texto.length > 0);
}

export function parseDfdFromMatriz(aoa: unknown[][], nomeArquivo: string): DfdParseado {
  // Lista achatada de textos de células não-vazias (p/ regex de cabeçalho).
  const cells: string[] = [];
  for (const row of aoa) {
    if (!row) continue;
    for (const c of row) {
      const s = txt(c);
      if (s) cells.push(s);
    }
  }

  const numero = buscar(cells, /N[úu]mero\s+DFD\s*:?\s*(\d+)/i);
  const planejamento = buscar(cells, /Planejamento\s*:?\s*(\d+)/i);
  const tipo = buscar(cells, /Tipo\s+DFD\s*:?\s*(.+)/i);
  const orgaoEntidade = buscar(cells, /[ÓO]rg[ãa]o\s*\/?\s*Entidade\s*:?\s*(.+)/i);
  const setorRequisitante = buscar(cells, /Setor\s+Requisitante\s*:?\s*(.+)/i);
  const responsavel = buscar(cells, /Respons[áa]vel\s+pela\s+Demanda\s*:?\s*(.+)/i);
  const matricula = buscar(cells, /Matr[íi]cula\s*:?\s*(\S.*)$/i);
  const email = buscar(cells, /E-?mail\s*:?\s*([^\s]+@[^\s]+)/i);
  const telefone = buscar(cells, /Telefone\s*:?\s*(\S.*)$/i);

  // objeto = texto antes de "Número DFD" na célula que o contém (ex.: F5).
  const celNumero = cells.find((s) => /N[úu]mero\s+DFD/i.test(s));
  const objeto = celNumero
    ? celNumero
        .split(/N[úu]mero\s+DFD/i)[0]
        .replace(/[\s:–—-]+$/, "")
        .trim() || null
    : null;

  // sigla do setor = trecho antes de " - " (só quando há separador claro).
  let siglaSetor: string | null = null;
  if (setorRequisitante) {
    const partes = setorRequisitante.split(/\s+[-–—]\s+/);
    if (partes.length > 1) siglaSetor = norm(partes[0]) || null;
  }

  // valor estimado: prefere a nota que contém "ESTIMATIVA"; senão o 1º "R$".
  const comEstimativa = cells.find(
    (s) => /ESTIMATIVA/i.test(stripAccents(s)) && RE_VALOR.test(s),
  );
  const alvoValor = comEstimativa ?? cells.find((s) => RE_VALOR.test(s));
  const valorEstimado = alvoValor
    ? parseNumberBR(alvoValor.match(RE_VALOR)?.[1] ?? null)
    : null;

  // Cabeçalho da tabela de itens: linha que casa ITEM + QUANTIDADE + (CÓDIGO|DESCRIÇÃO).
  let headerRow = -1;
  let colMap: ColMap = {};
  for (let r = 0; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const found: ColMap = {};
    row.forEach((c, i) => {
      const campo = CABECALHO_ITEM[norm(c)];
      if (campo && found[campo] == null) found[campo] = i;
    });
    if (
      found.item != null &&
      found.quantidade != null &&
      (found.codigo != null || found.descricao != null)
    ) {
      headerRow = r;
      colMap = found;
      break;
    }
  }

  const itens: DfdItemParseado[] = [];
  let valorTotalGrand: number | null = null;
  if (headerRow >= 0) {
    const col = (row: unknown[], i?: number) => (i == null ? null : row[i]);
    for (let r = headerRow + 1; r < aoa.length; r++) {
      const row = aoa[r] ?? [];
      const vazia = row.every((c) => txt(c) === "");
      if (vazia) continue; // pula linhas em branco entre itens
      const itemTxt = txt(col(row, colMap.item));
      const ehItem = /^\d+(?:[.,]0+)?$/.test(itemTxt);
      const codigo = txt(col(row, colMap.codigo)) || null;
      const descricao = txt(col(row, colMap.descricao)) || null;
      // Uma linha só é item se o ITEM é um inteiro puro E há código/descrição —
      // assim a linha "VALOR TOTAL" (grand total) e a NOTA encerram a leitura.
      if (!ehItem || (!codigo && !descricao)) {
        // linha de total: "VALOR TOTAL" na tabela → captura o grand total.
        if (colMap.valorTotal != null && /VALOR TOTAL/.test(norm(row.map(txt).join(" ")))) {
          valorTotalGrand = parseNumberBR(col(row, colMap.valorTotal));
        }
        break;
      }
      itens.push({
        item: parseIntBR(itemTxt),
        codigo,
        descricao,
        unidade: txt(col(row, colMap.unidade)) || null,
        quantidade: parseNumberBR(col(row, colMap.quantidade)),
        valorUnitario: parseNumberBR(col(row, colMap.valorUnitario)),
        valorTotal: parseNumberBR(col(row, colMap.valorTotal)),
      });
    }
  }

  const somaItens = itens.reduce((s, it) => s + (it.valorTotal ?? 0), 0);
  const valorTotal = valorTotalGrand ?? (somaItens > 0 ? Math.round(somaItens * 100) / 100 : null);

  if (!numero) {
    throw new Error(
      'Não encontrei o "Número DFD" no cabeçalho. Confira se é um DFD emitido (.xlsx).',
    );
  }
  if (itens.length === 0) {
    throw new Error(
      "Não encontrei itens na Seção 4 (ITEM / CÓDIGO / DESCRIÇÃO / UNIDADE / QUANTIDADE).",
    );
  }

  return {
    numero,
    planejamento,
    tipo,
    objeto,
    orgaoEntidade,
    setorRequisitante,
    siglaSetor,
    responsavel,
    matricula,
    email,
    telefone,
    valorEstimado,
    valorTotal,
    nomeArquivo,
    secoes: coletarSecoes(aoa),
    itens,
  };
}
