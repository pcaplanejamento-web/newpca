/**
 * Os ITENS do Dashboard do PCA num texto COMPACTO (puro, testado): milhares de linhas vão ao navegador como UM texto
 * `{c: campos, l: tuplas}` — as chaves não se repetem por item (um PCA de 20 mil itens tinha ~20 chaves × 20 mil). O texto
 * é montado UMA vez por versão dos dados (dentro do memo do Dashboard) e lido UMA vez no cliente.
 */

import type { ItemRow } from "./queries.ts";

/** A ordem fixa dos campos na tupla (a mesma do `ItemRow`). */
const CAMPOS = [
  "id",
  "idProduto",
  "sequencial",
  "nomeProduto",
  "unidadeMedida",
  "quantidade",
  "valorReferencia",
  "valorTotal",
  "classificacao",
  "dataDesejada",
  "codigo",
  "municipio",
  "dfdId",
  "dfdNumero",
  "protocoloNumero",
  "itemNumero",
  "ano",
  "mes",
  "anual",
  "prioridade",
] as const satisfies readonly (keyof ItemRow)[];

type Campo = (typeof CAMPOS)[number];

/** Itens → texto compacto. O campo AUSENTE vira `null` e só os campos com algum valor entram (o lista não leva os do DFD). */
export function itensParaTexto(itens: readonly ItemRow[]): string {
  const usados = CAMPOS.filter((c) => itens.some((i) => i[c] !== undefined));
  const linhas = itens.map((i) => usados.map((c) => (i[c] === undefined ? null : i[c])));
  return JSON.stringify({ c: usados, l: linhas });
}

/** Texto compacto → itens (tolerante: o formato antigo — a lista de objetos — também é lido). Campo `null` que era
 * opcional volta ausente só no `anual` (falso); os demais voltam `null` (o mesmo significado na tela). */
export function itensDoTexto(texto: string): ItemRow[] {
  const dado = JSON.parse(texto) as unknown;
  if (Array.isArray(dado)) return dado as ItemRow[];
  const { c, l } = dado as { c: Campo[]; l: unknown[][] };
  return l.map((t) => {
    const item: Record<string, unknown> = {};
    for (let k = 0; k < c.length; k++) {
      const v = t[k];
      if (v === null && c[k] === "anual") continue;
      item[c[k]] = v;
    }
    return item as ItemRow;
  });
}
