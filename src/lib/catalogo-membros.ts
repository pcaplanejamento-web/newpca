/**
 * Pertencimento de um item de catálogo a MÚLTIPLOS catálogos (item COMPARTILHADO). O item
 * tem um catálogo de ORIGEM (`catalogo_id`) + `catalogos_extra` (JSON `number[]`) — o
 * pertencimento é `[origem, ...extra]`, sem duplicar a linha do item. Puro/testável (sem
 * `getDb`); a UNIÃO de tipos de DFD é feita pelo chamador com `normalizarTipos`.
 */

/** Todos os catálogos de um item (origem primeiro, sem duplicados). */
export function membrosDoItem(origem: number, extra: number[]): number[] {
  return [origem, ...extra.filter((c) => c !== origem)];
}

/** Adiciona `alvo` aos extras (sem duplicar, ignorando a origem). Devolve os NOVOS extras. */
export function comCatalogo(origem: number, extra: number[], alvo: number): number[] {
  const ex = extra.filter((c) => c !== origem);
  if (alvo === origem || ex.includes(alvo)) return ex;
  return [...ex, alvo];
}

export type ResolucaoRemocao = { origem: number; extra: number[] } | "excluir";

/**
 * Remove o item do catálogo `remover`. Se `remover` é um extra, some do extra. Se é a
 * ORIGEM e há extras, **reatribui a origem** ao 1º extra (o item continua existindo). Se
 * era o ÚNICO catálogo → `"excluir"` (o item deixa de existir). `remover` fora do
 * pertencimento → sem efeito (só normaliza os extras).
 */
export function resolverRemocao(origem: number, extra: number[], remover: number): ResolucaoRemocao {
  const ex = extra.filter((c) => c !== origem);
  if (remover === origem) {
    if (ex.length === 0) return "excluir";
    const [novaOrigem, ...resto] = ex;
    return { origem: novaOrigem, extra: resto };
  }
  return { origem, extra: ex.filter((c) => c !== remover) };
}
