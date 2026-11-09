import type { AbaPca } from "./PcaEspacoView";
import { EsqueletoChartCard } from "./ChartCard";
import { EsqueletoGradeEspacos } from "./CartaoEspacoEsqueleto";
import { EsqueletoTabela } from "./DataTableEsqueleto";
import { EsqueletoBarra, EsqueletoColunaEspaco, EsqueletoIndicadores } from "./EsqueletoTela";
import { EsqueletoFiltrosDashboard } from "./FiltrosDashboardEsqueleto";
import { EsqueletoSegmented } from "./SegmentedEsqueleto";
import { EsqueletoControle, Skeleton, SkeletonCartao } from "./Skeleton";

/**
 * ESQUELETO DE CADA ABA do espaço do PCA — composto SÓ pelos esqueletos dos componentes de cada aba (indicadores,
 * `Segmented`, `ChartCard`, `DataTable`, cartões de espaço), na MESMA ordem e nas mesmas grades da aba real. Usado pelo
 * `loading.tsx` da rota (a aba padrão, o Dashboard) e pelo `AbasEspaco` na troca de aba (`esqueletos`). Arquivo leve, sem
 * "use client": vem no HTML na hora. As abas de tabela vão até o fim do display (`cheia`), como a `scrollInterno`.
 */
export function EsqueletoAbaPca({ aba }: { aba: AbaPca }) {
  switch (aba) {
    case "dashboard":
      return (
        <>
          <EsqueletoIndicadores />
          {/* O cartão dos filtros (a linha única do `FiltrosDashboard`, com a ajuda e o PDF no fim). */}
          <EsqueletoFiltrosDashboard campos={5} fim={2} />
          <EsqueletoSegmented itens={2} />
          <div className="grid grid-cols-1 gap-[var(--gap-block)] lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <EsqueletoChartCard key={i} />
            ))}
            <EsqueletoChartCard corpo="h-[420px]" className="lg:col-span-2" />
          </div>
        </>
      );
    case "orcamento":
      return (
        <EsqueletoColunaEspaco>
          <EsqueletoIndicadores />
          <div className="flex flex-wrap items-center gap-2">
            <EsqueletoSegmented itens={2} />
            <EsqueletoSegmented itens={3} />
            <EsqueletoSegmented itens={3} />
            <EsqueletoControle className="w-full min-w-[12rem] sm:w-auto sm:max-w-sm sm:flex-1" />
            <Icones n={3} />
          </div>
          <EsqueletoTabela cheia linhas={12} colunas={8} />
        </EsqueletoColunaEspaco>
      );
    case "mesa":
      return (
        <EsqueletoColunaEspaco>
          <div className="flex flex-wrap items-center gap-2">
            <EsqueletoSegmented itens={3} />
            <EsqueletoSegmented itens={3} />
            <Icones n={5} />
          </div>
          <EsqueletoTabela cheia linhas={14} colunas={11} />
        </EsqueletoColunaEspaco>
      );
    case "importacao":
      return (
        <EsqueletoColunaEspaco>
          <EsqueletoSegmented itens={2} className="self-start" />
          <EsqueletoTabela cheia linhas={14} colunas={8} />
        </EsqueletoColunaEspaco>
      );
    case "documentos":
      return (
        <>
          <EsqueletoBarra icones={1} />
          <EsqueletoGradeEspacos espaco="gap-3" />
        </>
      );
    case "declaracoes":
      return (
        <EsqueletoColunaEspaco>
          <EsqueletoTabela cheia linhas={14} colunas={10} />
        </EsqueletoColunaEspaco>
      );
    case "configuracao":
      return (
        <div className="grid gap-[var(--gap-block)] lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
          <div className="space-y-[var(--gap-block)]">
            {[3, 2, 1, 1, 1, 3, 1].map((linhas, i) => (
              <SkeletonCartao key={i} linhas={linhas} />
            ))}
          </div>
          <div className="rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring lg:self-start">
            <Skeleton className="mb-3 h-4 w-1/3 rounded-sm" />
            <Skeleton className="mx-auto aspect-[4/5] w-full max-w-[280px] rounded-card" />
            <div className="mt-3 flex justify-center gap-2">
              <EsqueletoControle className="w-28" />
              <EsqueletoControle className="w-24" />
            </div>
          </div>
        </div>
      );
  }
}

/** Os botões só-ícone da barra, JUNTOS à direita (no celular quebram como um bloco, como na barra real). */
function Icones({ n }: { n: number }) {
  return (
    <div className="ml-auto flex items-center gap-2">
      {Array.from({ length: n }).map((_, i) => (
        <EsqueletoControle key={i} quadrado />
      ))}
    </div>
  );
}
