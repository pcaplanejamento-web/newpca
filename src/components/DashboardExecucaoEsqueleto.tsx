import { EsqueletoControle, Skeleton } from "./Skeleton";

/**
 * ESQUELETO do Dashboard da Execução — a MESMA grade dele (a faixa de confiança, os 4 indicadores, "Mais indicadores", os
 * filtros, o funil e a série), enquanto os dados chegam. Arquivo leve, sem "use client": vem no HTML na hora (o `loading.tsx` da tela).
 */
export function DashboardExecucaoEsqueleto() {
  return (
    <div aria-busy className="space-y-[var(--gap-block)]">
      <Skeleton className="h-5 w-64 rounded-control" />
      <div className="grid grid-cols-2 gap-[var(--gap-block)] lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[132px] rounded-card" />
        ))}
      </div>
      <EsqueletoControle className="mx-auto w-40" />
      <Skeleton className="h-[72px] rounded-card" />
      <Skeleton className="h-40 rounded-card" />
      <Skeleton className="h-[460px] rounded-card" />
    </div>
  );
}
