/**
 * INDICADORES de um orçamento — núcleo PURO (testável). Dotação ATUALIZADA = inicial + suplementação − anulação (a
 * convenção da execução orçamentária); % empenhado = empenho ÷ dotação atualizada (0 quando não há dotação).
 */
/** `reducao` = corte na dotação; `anulacao` = empenho anulado (devolve ao saldo). Saldo = atualizada − (empenho − anulação). */
export type TotaisOrcamento = { valorInicial: number; suplementacao: number; reducao?: number; anulacao: number; empenho: number };

export function dotacaoAtualizada(t: TotaisOrcamento): number {
  return (t.valorInicial || 0) + (t.suplementacao || 0) - (t.reducao || 0);
}

/** Empenho LÍQUIDO = empenhado − anulado. */
export function empenhoLiquido(t: TotaisOrcamento): number {
  return (t.empenho || 0) - (t.anulacao || 0);
}

export function pctEmpenhado(t: TotaisOrcamento): number {
  const base = dotacaoAtualizada(t);
  return base > 0 ? Math.min(100, Math.max(0, (empenhoLiquido(t) / base) * 100)) : 0;
}
