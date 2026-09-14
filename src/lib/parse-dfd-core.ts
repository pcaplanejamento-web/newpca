import { parseIntBR, parseNumberBR } from "./normalize.ts";
import {
  coletarSecoes,
  type DfdItemParseado,
  type DfdParseado,
  ehRuido,
  extrairCabecalho,
  extrairRefsDfd,
  norm,
  TITULO_SECAO_ITENS,
  txt,
} from "./parse-dfd-comum.ts";

/**
 * Núcleo PURO do parser de DFD a partir da PLANILHA (`.xlsx`) — recebe a matriz
 * de células (texto formatado; ver `parse-dfd.ts`) e reaproveita o cabeçalho e as
 * seções de `parse-dfd-comum.ts`; aqui fica só a tabela de itens da Seção 4 (que
 * na planilha é localizada por posição de coluna). Sem SheetJS/D1 → testável.
 */
export type { DfdItemParseado, DfdParseado, DfdSecao } from "./parse-dfd-comum.ts";

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

/** Primeira célula não-vazia da linha (para seções/rótulos). */
function primeiraCelula(row: unknown[]): string {
  for (const c of row) {
    const t = txt(c);
    if (t) return t;
  }
  return "";
}

export function parseDfdFromMatriz(aoa: unknown[][], nomeArquivo: string): DfdParseado {
  // Células achatadas (regex de cabeçalho) e "linhas iniciais" (seções).
  const cells: string[] = [];
  const leadings: string[] = [];
  for (const row of aoa) {
    const r = row ?? [];
    leadings.push(primeiraCelula(r));
    for (const c of r) {
      const s = txt(c);
      if (s) cells.push(s);
    }
  }

  const cab = extrairCabecalho(cells);

  // Cabeçalho da tabela: linha que casa ITEM + QUANTIDADE + (CÓDIGO|DESCRIÇÃO).
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
  let apoioSecao4 = ""; // texto de apoio abaixo da tabela (Seção 4)
  if (headerRow >= 0) {
    const col = (row: unknown[], i?: number) => (i == null ? null : row[i]);
    let fim = aoa.length;
    for (let r = headerRow + 1; r < aoa.length; r++) {
      const row = aoa[r] ?? [];
      const vazia = row.every((c) => txt(c) === "");
      if (vazia) continue;
      const itemTxt = txt(col(row, colMap.item));
      const ehItem = /^\d+(?:[.,]0+)?$/.test(itemTxt);
      const codigo = txt(col(row, colMap.codigo)) || null;
      const descricao = txt(col(row, colMap.descricao)) || null;
      if (!ehItem || (!codigo && !descricao)) {
        // linha "VALOR TOTAL" (grand total) → captura o total geral.
        if (colMap.valorTotal != null && /VALOR TOTAL/.test(norm(row.map(txt).join(" ")))) {
          valorTotalGrand = parseNumberBR(col(row, colMap.valorTotal));
        }
        fim = r;
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
    // Texto de apoio: linhas após a tabela até a próxima seção "N -" (pula total/ruído).
    const apoio: string[] = [];
    for (let k = fim; k < aoa.length; k++) {
      const lead = primeiraCelula(aoa[k] ?? []);
      if (!lead) continue;
      if (/^\d{1,2}\s*[-–—]\s/.test(lead)) break;
      if (ehRuido(lead) || /VALOR TOTAL/.test(norm(lead))) continue;
      apoio.push(lead);
    }
    apoioSecao4 = apoio.join(" ").replace(/\s+/g, " ").trim();
  }

  const somaItens = itens.reduce((s, it) => s + (it.valorTotal ?? 0), 0);
  const valorTotal = valorTotalGrand ?? (somaItens > 0 ? Math.round(somaItens * 100) / 100 : null);

  if (!cab.numero) {
    throw new Error(
      'Não encontrei o "Número DFD" no cabeçalho. Confira se é um DFD emitido (.xlsx).',
    );
  }
  if (itens.length === 0) {
    throw new Error(
      "Não encontrei itens na Seção 4 (ITEM / CÓDIGO / DESCRIÇÃO / UNIDADE / QUANTIDADE).",
    );
  }
  const secoes = coletarSecoes(leadings);
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
    assinaturas: [], // .xlsx não tem página de assinatura digital
  };
}
