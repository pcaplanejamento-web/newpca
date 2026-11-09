import { Skeleton } from "./Skeleton";

/** A altura do DESENHO do `GraficoTemporal` (o `SerieTemporal preencher`). Uma só: o gráfico, o esqueleto e o carregamento. */
export const ALTURA_GRAFICO_TEMPORAL = 420;

/**
 * ESQUELETO DO `GraficoTemporal` — o desenho no lugar e no tamanho dele. `cartao` = já na moldura do `ChartCard` sem título
 * (como a Execução e o painel da Frota o usam), para os esqueletos das TELAS. Sem `cartao`, só o desenho: o carregamento
 * do código do gráfico (`next/dynamic`) dentro do cartão real. Arquivo leve, sem "use client".
 */
export function EsqueletoGraficoTemporal({ cartao = false }: { cartao?: boolean }) {
  const desenho = <Skeleton className="w-full rounded-card" style={{ height: ALTURA_GRAFICO_TEMPORAL }} />;
  if (!cartao) return desenho;
  return <div className="rounded-card border border-border/60 bg-surface p-[var(--pad-card)] shadow-soft">{desenho}</div>;
}
