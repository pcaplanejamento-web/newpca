import { norm } from "./parse-dfd-comum.ts";

/**
 * Tipos e helpers PUROS compartilhados pelo parser de ORÇAMENTO (relatório CUBO) —
 * fonte única, sem SheetJS/D1. Espelha o papel de `parse-catalogo-comum`.
 */

export type OrcamentoItemParseado = {
  orgao: string;
  unidade: string;
  nomeElemento: string;
  codigoElemento: string;
  funcao: string;
  programa: string;
  acao: string;
  ficha: string;
  fonte: string;
  valorEmendaImpositiva: number;
  valorInicial: number;
  valorSuplementacao: number;
  valorEmpenho: number;
  saldo: number;
  valorAnulacao: number;
  sequencial: number;
};

/** Um problema numa LINHA da planilha (a linha como o Excel numera — 1 = a primeira). */
export type ErroPlanilhaOrcamento = { linha: number; coluna: string; motivo: string };

export type OrcamentoParseado = {
  nome: string | null; // título sugerido (editável no envio)
  itens: OrcamentoItemParseado[];
  total: number; // Σ Valor Inicial (dotação)
  /** As colunas OBRIGATÓRIAS que a planilha não tem (rótulos) — com qualquer uma, não se importa. */
  faltam: string[];
  /** Os dados incorretos linha a linha (texto obrigatório vazio, valor que não é número, ficha fora do padrão). */
  erros: ErroPlanilhaOrcamento[];
};

// Colunas do relatório de orçamento — detectadas pelo CABEÇALHO, em qualquer ordem.
export type ColKeyOrcamento =
  | "orgao"
  | "unidade"
  | "nomeElemento"
  | "codigoElemento"
  | "funcao"
  | "programa"
  | "acao"
  | "ficha"
  | "fonte"
  | "emenda"
  | "inicial"
  | "suplementacao"
  | "empenho"
  | "saldo"
  | "anulacao";

/**
 * As colunas OBRIGATÓRIAS do relatório (o padrão ATUAL do CUBO), na ordem do relatório — a planilha só é aceita com
 * TODAS (os vínculos dependem da Ação; as visões e o comparativo, das demais). `texto` = o dado não pode faltar na linha.
 */
export const COLUNAS_ORCAMENTO: { key: ColKeyOrcamento; rotulo: string; texto: boolean }[] = [
  { key: "orgao", rotulo: "Órgão", texto: true },
  { key: "unidade", rotulo: "Unidade", texto: true },
  { key: "funcao", rotulo: "Função", texto: true },
  { key: "programa", rotulo: "Programa", texto: true },
  { key: "acao", rotulo: "Ação", texto: true },
  { key: "nomeElemento", rotulo: "Nome Elemento", texto: true },
  { key: "codigoElemento", rotulo: "Código Elemento", texto: true },
  { key: "ficha", rotulo: "Ficha", texto: true },
  { key: "fonte", rotulo: "Fonte", texto: true },
  { key: "emenda", rotulo: "Valor Emenda Impositiva", texto: false },
  { key: "inicial", rotulo: "Valor Inicial", texto: false },
  { key: "suplementacao", rotulo: "Valor Suplementação", texto: false },
  { key: "empenho", rotulo: "Valor Empenho", texto: false },
  { key: "saldo", rotulo: "Saldo", texto: false },
  { key: "anulacao", rotulo: "Valor Anulação", texto: false },
];

/** Classifica um rótulo/token de cabeçalho numa coluna do orçamento (ou null). A palavra
 * DISTINTIVA decide o valor ("VALOR" sozinho não decide). */
export function rotuloColunaOrcamento(str: string): ColKeyOrcamento | null {
  const s = norm(str); // UPPER + sem acento + espaços colapsados
  if (!s) return null;
  // Valores.
  if (/EMENDA/.test(s)) return "emenda";
  if (/INICIAL/.test(s)) return "inicial";
  if (/SUPLEMENT/.test(s)) return "suplementacao";
  if (/EMPENHO/.test(s)) return "empenho";
  if (/SALDO/.test(s)) return "saldo";
  if (/ANULA/.test(s)) return "anulacao";
  // Texto.
  if (/^ORGAO/.test(s)) return "orgao";
  if (/^UNIDADE/.test(s)) return "unidade";
  if (/^NOME/.test(s)) return "nomeElemento"; // "Nome Elemento"
  if (/^COD/.test(s)) return "codigoElemento"; // "Codigo Elemento"
  // Classificação programática + fonte de recurso (novo padrão do CUBO).
  if (/^FUNCAO/.test(s)) return "funcao";
  if (/^PROGRAMA/.test(s)) return "programa";
  if (/^ACAO/.test(s)) return "acao";
  if (/^FICHA/.test(s)) return "ficha";
  if (/^FONTE/.test(s)) return "fonte";
  return null;
}

/**
 * Converte um valor de planilha (texto) para número, tolerando o formato en-US
 * ("5,000,000.00") E pt-BR ("5.000.000,00"), inteiros com milhar e negativos "(x)".
 * Vazio/inválido → `null`.
 */
export function parseValorPlanilha(raw: unknown): number | null {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const nDot = (s.match(/\./g) || []).length;
  const nCom = (s.match(/,/g) || []).length;
  let normd: string;
  if (nDot > 0 && nCom > 0) {
    // Separadores mistos → o ÚLTIMO é o decimal; o outro é milhar.
    const dec = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    normd = s.replace(dec === "," ? /\./g : /,/g, "").replace(dec, ".");
  } else if (nDot === 0 && nCom === 0) {
    normd = s;
  } else {
    const sep = nDot > 0 ? "." : ",";
    const count = nDot + nCom;
    const depois = s.length - s.lastIndexOf(sep) - 1;
    // Um único separador com 3 dígitos depois = MILHAR; senão = decimal. Repetido = milhar.
    normd = count === 1 && depois !== 3 ? s.replace(sep, ".") : s.split(sep).join("");
  }
  const n = Number.parseFloat(normd);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}
