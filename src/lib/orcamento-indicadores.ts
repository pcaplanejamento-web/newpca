/**
 * INDICADORES de um orçamento — núcleo PURO (testável). Dotação ATUALIZADA = inicial + suplementação − anulação (a
 * convenção da execução orçamentária); % empenhado = empenho ÷ dotação atualizada (0 quando não há dotação).
 */
export type TotaisOrcamento = { valorInicial: number; suplementacao: number; anulacao: number; empenho: number };

export function dotacaoAtualizada(t: TotaisOrcamento): number {
  return (t.valorInicial || 0) + (t.suplementacao || 0) - (t.anulacao || 0);
}

export function pctEmpenhado(t: TotaisOrcamento): number {
  const base = dotacaoAtualizada(t);
  return base > 0 ? Math.min(100, Math.max(0, ((t.empenho || 0) / base) * 100)) : 0;
}
