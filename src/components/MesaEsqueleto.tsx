import { DashboardMesaEsqueleto } from "./DashboardMesaEsqueleto";
import { EsqueletoTabela } from "./DataTableEsqueleto";
import { EsqueletoSegmented } from "./SegmentedEsqueleto";
import { EsqueletoControle } from "./Skeleton";

/** A BARRA da Mesa: o seletor de Mesa e as visões à esquerda; os botões só-ícone (filtros, dados completos…) à direita. */
export function EsqueletoBarraMesa() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <EsqueletoControle className="w-40" />
      <EsqueletoSegmented itens={4} />
      <div className="ml-auto flex items-center gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <EsqueletoControle key={i} quadrado />
        ))}
      </div>
    </div>
  );
}

/**
 * ESQUELETO DA VISÃO da Mesa — a tabela até o fim do display (Protocolos, DFDs, Itens) ou o Dashboard (`?vista=dashboard`,
 * o MESMO do código do Dashboard chegando). Arquivo leve, sem "use client".
 */
export function EsqueletoVistaMesa({ vista }: { vista?: string | null }) {
  return vista === "dashboard" ? <DashboardMesaEsqueleto metricas /> : <EsqueletoTabela cheia linhas={14} colunas={8} />;
}
