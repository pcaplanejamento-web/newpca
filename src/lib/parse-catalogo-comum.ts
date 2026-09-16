import { norm } from "./parse-dfd-comum.ts";

/**
 * Tipos e helpers PUROS compartilhados pelos parsers de CATÁLOGO (PDF e XLSX) —
 * fonte única, sem geometria/SheetJS. Espelha o papel de `parse-dfd-comum`.
 */

export type CatalogoItemParseado = {
  sequencial: number | null;
  codigo: string; // normalizado (só dígitos)
  codigoRaw: string | null; // forma original do arquivo (ex.: "524.175.984")
  descricao: string;
  unidade: string | null;
};

export type CatalogoParseado = {
  nome: string | null; // título "CATÁLOGO ..." sugerido (editável no envio)
  itens: CatalogoItemParseado[];
  duplicadosNoArquivo: string[]; // códigos repetidos no próprio arquivo
};

export type ColKey = "item" | "codigo" | "descricao" | "unidade";

/** Classifica um rótulo/token de cabeçalho numa coluna (ou null). Qtd/Valor/Unitário
 * são IGNORADOS (não viram coluna) — costumam vir vazios. */
export function rotuloColuna(str: string): ColKey | null {
  const s = norm(str); // UPPER + sem acento + espaços colapsados
  if (/QUANT|QTD|VALOR|UNIT|TOTAL|PRECO/.test(s)) return null;
  if (/^COD/.test(s)) return "codigo"; // COD, CODIGO, "COD PRODUTO", "COD. PROD"
  if (/^DESCRI/.test(s)) return "descricao";
  if (/^UN(D|ID)/.test(s) || /^MED/.test(s)) return "unidade"; // UND, UNID, UNIDADE, UND.MED, MEDIDA
  if (/^ITEM/.test(s) || /SEQ/.test(s)) return "item"; // ITEM, "Nº Seq"
  return null;
}

/** Normaliza o código para só dígitos (chave canônica global). */
export function normalizarCodigo(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** Título "CATÁLOGO"/"CATÁLAGO" entre as linhas de texto dadas (nome sugerido); `null` se não houver. */
export function acharTitulo(textos: string[]): string | null {
  for (const t of textos) {
    const txt = t.replace(/\s+/g, " ").trim();
    if (txt && /CATAL[AO]GO/.test(norm(txt))) return txt; // "CATÁLOGO" e a variante "CATÁLAGO"
  }
  return null;
}

/** Códigos repetidos numa lista de itens (para apontar duplicados no arquivo). */
export function duplicadosDe(itens: CatalogoItemParseado[]): string[] {
  const vistos = new Set<string>();
  const dups = new Set<string>();
  for (const it of itens) {
    if (vistos.has(it.codigo)) dups.add(it.codigo);
    else vistos.add(it.codigo);
  }
  return [...dups];
}
