import { EsqueletoGradeEspacos } from "./CartaoEspacoEsqueleto";
import { EsqueletoTabela } from "./DataTableEsqueleto";
import { EsqueletoPadronizacao } from "./PadronizacaoEsqueleto";
import { EsqueletoSegmented } from "./SegmentedEsqueleto";
import { EsqueletoControle } from "./Skeleton";

/** A BARRA do Catálogo: as visões à esquerda e "Exportar modelo" à direita. */
export function EsqueletoBarraCatalogo() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <EsqueletoSegmented itens={4} />
      <EsqueletoControle className="ml-auto w-36" />
    </div>
  );
}

/**
 * ESQUELETO DA VISÃO do Catálogo (`?vista=`): a grade dos catálogos e pastas, a Lista de Itens (tabela) ou a
 * padronização (Medida | Classificações — o MESMO do código da visão chegando). Arquivo leve, sem "use client".
 */
export function EsqueletoVistaCatalogo({ vista }: { vista?: string | null }) {
  if (vista === "lista") return <EsqueletoTabela linhas={14} colunas={6} />;
  if (vista === "unidades" || vista === "classificacoes") return <EsqueletoPadronizacao />;
  return <EsqueletoGradeEspacos espaco="gap-3" />;
}
