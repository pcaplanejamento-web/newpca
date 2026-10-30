import { EsqueletoCartaoFiltros } from "./DashboardExecucaoEsqueleto";
import { EsqueletoTabela } from "./DataTableEsqueleto";
import { EsqueletoIndicadores } from "./EsqueletoTela";
import { Skeleton } from "./Skeleton";

/**
 * ESQUELETO DAS TELAS DA FROTA — UM só, o MESMO no `loading.tsx` da rota e na tela enquanto os dados chegam (a troca é
 * contínua, nunca dois esqueletos diferentes): os indicadores, o cartão dos filtros e o gráfico (painel) ou a tabela.
 * `veiculos` = os indicadores e a tabela (a tela de Veículos não tem o cartão dos filtros). Sem "use client".
 */
export function EsqueletoFrota({ tipo }: { tipo: "painel" | "tabela" | "veiculos" }) {
  return (
    <div aria-busy className="space-y-[var(--gap-block)]">
      <EsqueletoIndicadores />
      {tipo !== "veiculos" && <EsqueletoCartaoFiltros campos={10} />}
      {tipo === "painel" ? <Skeleton className="h-[372px] rounded-card" /> : <EsqueletoTabela linhas={12} colunas={8} />}
    </div>
  );
}
