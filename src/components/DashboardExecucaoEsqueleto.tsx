import { EsqueletoTabela } from "./DataTableEsqueleto";
import { EsqueletoFiltrosDashboard } from "./FiltrosDashboardEsqueleto";
import { EsqueletoGraficoTemporal } from "./GraficoTemporalEsqueleto";
import { EsqueletoControle, Skeleton } from "./Skeleton";

/** Quantos filtros a Execução mostra no cartão: Visão, Período e Tipo + as 12 dimensões (`DIMS_EXEC`). */
const CAMPOS_EXECUCAO = 15;

/**
 * ESQUELETO do Dashboard da Execução — a MESMA grade dele: os 3 indicadores de saldo, "Mais indicadores", o cartão dos
 * filtros, o gráfico no tempo e o demonstrativo, enquanto os dados chegam. Arquivo leve, sem "use client": vem no HTML na
 * hora (o `loading.tsx` da tela) e é o MESMO que a tela mostra enquanto busca os dados (um só esqueleto).
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
      <EsqueletoFiltrosDashboard grade campos={CAMPOS_EXECUCAO} />
      <EsqueletoGraficoTemporal cartao />
      {/* O demonstrativo: "Demonstrativo por" + o seletor, e a tabela. */}
      <div className="rounded-card border border-border/60 bg-surface p-[var(--pad-card)] shadow-soft">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Skeleton className="h-4 w-36 rounded-sm" />
          <EsqueletoControle className="w-full sm:w-56" />
        </div>
        <EsqueletoTabela linhas={8} colunas={8} />
      </div>
    </div>
  );
}
