import { EsqueletoTabela } from "./DataTableEsqueleto";
import { EsqueletoIndicadores } from "./EsqueletoTela";
import { EsqueletoFiltrosDashboard } from "./FiltrosDashboardEsqueleto";
import { EsqueletoGraficoTemporal } from "./GraficoTemporalEsqueleto";
import { EsqueletoChartCard } from "./ChartCard";
import { EsqueletoSegmented } from "./SegmentedEsqueleto";

/**
 * ESQUELETO DAS TELAS DA FROTA — UM só, o MESMO no `loading.tsx` da rota e na tela enquanto os dados chegam (a troca é
 * contínua, nunca dois esqueletos diferentes): os indicadores, o cartão dos filtros e o gráfico (painel) ou a tabela.
 * `veiculos` = os indicadores e a tabela (a tela de Veículos não tem o cartão dos filtros). Sem "use client".
 */
export function EsqueletoFrota({ tipo }: { tipo: "painel" | "tabela" | "veiculos" }) {
  return (
    // As telas de TABELA cabem no display (como o `AteOFim` real) — a tabela vai até o fim, sem rolar a página.
    <div
      aria-busy
      className={`flex flex-col gap-[var(--gap-block)] ${tipo === "painel" ? "" : "lg:h-[max(240px,calc(100dvh-var(--h-header)-var(--pad-canvas-y)*2))]"}`}
    >
      <EsqueletoIndicadores />
      {tipo !== "veiculos" && <EsqueletoFiltrosDashboard grade campos={10} />}
      {tipo === "painel" ? (
        <>
          {/* O painel: o gasto no tempo, os dois gráficos de barras e o demonstrativo | alertas. */}
          <EsqueletoGraficoTemporal cartao />
          <div className="grid gap-[var(--gap-block)] lg:grid-cols-2">
            <EsqueletoChartCard corpo="h-[18rem] sm:h-[22rem]" />
            <EsqueletoChartCard corpo="h-[18rem] sm:h-[22rem]" />
          </div>
          <div className="rounded-card border border-border/60 bg-surface p-[var(--pad-card)] shadow-soft">
            <EsqueletoSegmented itens={2} className="mb-2" />
            <EsqueletoTabela linhas={8} colunas={8} />
          </div>
        </>
      ) : (
        <EsqueletoTabela cheia linhas={12} colunas={8} />
      )}
    </div>
  );
}
