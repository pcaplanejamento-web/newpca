import { parseIntBR, parseNumberBR, stripAccents } from "./normalize.ts";

/**
 * Núcleo PURO do parser de DFD (Documento de Formalização da Demanda).
 *
 * Recebe uma matriz de células (array de arrays, texto formatado — ver
 * `parse-dfd.ts`) e extrai os metadados do cabeçalho + a tabela de itens da
 * Seção 4. Sem SheetJS e sem D1 → testável isoladamente no Node.
 *
 * O DFD é um FORMULÁRIO (não uma tabela achatada): rótulos "Label: valor" no
 * cabeçalho, uma tabela ITEM/CÓDIGO/DESCRIÇÃO/UNIDADE/QUANTIDADE (sem preço por
 * item) e um único valor estimado embutido numa nota.
 */

export type DfdItemParseado = {
  item: number | null;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
  quantidade: number | null;
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
  valorEstimado: number | null;
  nomeArquivo: string;
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

// Cabeçalho da tabela de itens (Seção 4). Chave = norm da célula.
const CABECALHO_ITEM: Record<string, keyof ColMap> = {
  ITEM: "item",
  CODIGO: "codigo",
  DESCRICAO: "descricao",
  UNIDADE: "unidade",
  QUANTIDADE: "quantidade",
  QTD: "quantidade",
  QTDE: "quantidade",
};

type ColMap = {
  item?: number;
  codigo?: number;
  descricao?: number;
  unidade?: number;
  quantidade?: number;
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
  const responsavel = buscar(cells, /Respons[áa]vel(?:\s+pela\s+Demanda)?\s*:?\s*(.+)/i);

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
      // assim a NOTA logo após a tabela (texto longo) encerra a leitura.
      if (!ehItem || (!codigo && !descricao)) break;
      itens.push({
        item: parseIntBR(itemTxt),
        codigo,
        descricao,
        unidade: txt(col(row, colMap.unidade)) || null,
        quantidade: parseNumberBR(col(row, colMap.quantidade)),
      });
    }
  }

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
    valorEstimado,
    nomeArquivo,
    itens,
  };
}
