import { EsqueletoControle, Skeleton } from "./Skeleton";

/**
 * ESQUELETO do Dashboard da Execução — a MESMA grade dele (os 3 indicadores de saldo, "Mais indicadores", o cartão dos filtros,
 * a série e o demonstrativo), enquanto os dados chegam. Arquivo leve, sem "use client": vem no HTML na hora (o `loading.tsx` da tela).
 */
export function DashboardExecucaoEsqueleto() {
  return (
    <div aria-busy className="space-y-[var(--gap-block)]">
      <div className="grid grid-cols-1 gap-[var(--gap-block)] md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[132px] rounded-card" />
        ))}
      </div>
      <EsqueletoControle className="w-full" />
      <EsqueletoCartaoFiltros />
      <Skeleton className="h-[372px] rounded-card" />
      <Skeleton className="h-[420px] rounded-card" />
    </div>
  );
}

/** O CARTÃO DOS FILTROS (`FiltrosDashboard grade`): os campos em colunas — o da Execução e o das Frotas. */
export function EsqueletoCartaoFiltros({ campos = 14 }: { campos?: number }) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded-card border border-border bg-surface p-[var(--pad-card)] min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7">
      {Array.from({ length: campos }, (_, i) => (
        <EsqueletoControle key={i} className="w-full" />
      ))}
    </div>
  );
}
