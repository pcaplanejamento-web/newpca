import { limparTexto } from "./normalize.ts";
import {
  codigoDoItem,
  coletarSecoes,
  type DfdItemParseado,
  type DfdParseado,
  ehRuido,
  extrairCabecalho,
  extrairRefsDfd,
  limparDescricaoItem,
  norm,
  numeroDfd,
  TITULO_SECAO_ITENS,
} from "./parse-dfd-comum.ts";

/**
 * Núcleo PURO do parser de DFD a partir da PLANILHA (`.xlsx`) — recebe a matriz
 * de células (texto formatado; ver `parse-dfd.ts`) e, opcionalmente, a matriz dos
 * VALORES crus (números como número) e reaproveita o cabeçalho e as seções de
 * `parse-dfd-comum.ts`; aqui fica só a tabela de itens da Seção 4 (que na planilha
 * é localizada por posição de coluna). Sem SheetJS/D1 → testável.
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

/** Texto LIMPO de uma célula (`limparTexto`: tabs/quebras/NBSP viram um espaço; invisíveis somem). */
const txt = (v: unknown): string => limparTexto(v);

/** Primeira célula não-vazia da linha (para seções/rótulos). */
function primeiraCelula(row: unknown[]): string {
  for (const c of row) {
    const t = txt(c);
    if (t) return t;
  }
  return "";
}

// Nº do item na célula ITEM ("1", "01", "1.0", "1,0", "1." — texto formatado).
const RE_NUMERO_ITEM = /^(\d{1,6})(?:[.,]0+)?\.?$/;

/**
 * CÓDIGO do item a partir da célula: o texto formatado só com os dígitos (preserva o ZERO À ESQUERDA de um formato
 * "0000000000"); se a célula é NÚMERO e o texto veio em notação científica ("5.24194E+11") ou com casas decimais
 * ("5241937263.00"), o código sai do valor inteiro cru (sem inventar dígitos). Puro.
 */
function codigoCelula(texto: unknown, cru: unknown): string | null {
  const t = txt(texto);
  if (typeof cru === "number" && Number.isInteger(cru) && cru >= 0 && !/^\d+$/.test(t)) {
    return Number.isSafeInteger(cru) ? String(cru) : BigInt(cru).toString();
  }
  // Notação científica sem o valor cru: os dígitos exatos se perderam — sem código (nunca um código inventado).
  if (/^\d+(?:[.,]\d+)?E[+-]?\d+$/i.test(t)) return null;
  return codigoDoItem(t);
}

export function parseDfdFromMatriz(
  aoa: unknown[][],
  nomeArquivo: string,
  // Valores CRUS das células (`sheet_to_json({raw:true})`, mesma forma da `aoa`): número vem como número — a
  // quantidade/valor não depende do texto formatado ("1,000" do formato en-US virava 1). Ausente ⇒ só o texto.
  valores?: unknown[][],
): DfdParseado {
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
    const cru = (r: number, i?: number) => (i == null ? undefined : valores?.[r]?.[i]);
    // Número da célula: o valor CRU quando é número (exato); senão o texto em pt-BR (`numeroDfd`).
    const num = (r: number, row: unknown[], i?: number) => {
      const v = cru(r, i);
      return typeof v === "number" ? (Number.isFinite(v) ? v : null) : numeroDfd(col(row, i));
    };
    const numeroItem = (r: number, row: unknown[]): number | null => {
      const v = cru(r, colMap.item);
      if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? v : null;
      const m = txt(col(row, colMap.item)).match(RE_NUMERO_ITEM);
      return m ? Number(m[1]) : null;
    };
    // Linhas da tabela: da 1ª após o cabeçalho até a linha que a encerra (TOTAL/apoio/seção). Uma linha SEM nº
    // no MEIO da tabela (há item depois dela) NÃO a encerra — antes, todos os itens seguintes se perdiam.
    const itemDepois: boolean[] = new Array(aoa.length + 1).fill(false);
    for (let r = aoa.length - 1; r > headerRow; r--) itemDepois[r] = itemDepois[r + 1] || numeroItem(r, aoa[r] ?? []) != null;
    let fim = aoa.length;
    for (let r = headerRow + 1; r < aoa.length; r++) {
      const row = aoa[r] ?? [];
      if (row.every((c) => txt(c) === "")) continue;
      const n = numeroItem(r, row);
      const codigo = codigoCelula(col(row, colMap.codigo), cru(r, colMap.codigo));
      const descricao = limparDescricaoItem(col(row, colMap.descricao)) || null;
      const campos = {
        unidade: txt(col(row, colMap.unidade)) || null,
        quantidade: num(r, row, colMap.quantidade),
        valorUnitario: num(r, row, colMap.valorUnitario),
        valorTotal: num(r, row, colMap.valorTotal),
      };
      const temValor = campos.quantidade != null || campos.valorUnitario != null || campos.valorTotal != null;
      if (n != null && (codigo || descricao || temValor)) {
        itens.push({ item: n, codigo, descricao, ...campos });
        continue;
      }
      if (n == null && itens.length > 0 && itemDepois[r + 1] && !txt(col(row, colMap.item)) && (codigo || descricao)) {
        const anterior = itens[itens.length - 1];
        // Só descrição = continuação da descrição do item anterior; com código/valores = item sem nº (nunca se
        // mistura a outro).
        if (!codigo && !temValor) anterior.descricao = limparDescricaoItem(`${anterior.descricao ?? ""} ${descricao ?? ""}`) || null;
        else itens.push({ item: null, codigo, descricao, ...campos });
        continue;
      }
      // linha "VALOR TOTAL" (grand total) → captura o total geral.
      if (colMap.valorTotal != null && /VALOR TOTAL/.test(norm(row.map(txt).join(" ")))) {
        valorTotalGrand = num(r, row, colMap.valorTotal);
      }
      fim = r;
      break;
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
