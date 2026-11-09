import type { AbaOrcamento } from "./OrcamentoEspacoView";
import { EsqueletoTabela } from "./DataTableEsqueleto";
import { EsqueletoColunaEspaco, EsqueletoIndicadores } from "./EsqueletoTela";
import { EsqueletoSegmented } from "./SegmentedEsqueleto";
import { EsqueletoControle } from "./Skeleton";

/**
 * ESQUELETO DE CADA ABA do espaço do Orçamento — os indicadores (ficam em todas as abas) e o conteúdo da aba, com os
 * esqueletos dos componentes dela, até o fim do display. Usado pelo `loading.tsx` da rota (Lançamentos, a aba padrão) e
 * pelo `AbasEspaco` na troca de aba (`esqueletos`). Arquivo leve, sem "use client".
 */
export function EsqueletoAbaOrcamento({ aba }: { aba: AbaOrcamento }) {
  return (
    <EsqueletoColunaEspaco>
      <EsqueletoIndicadores />
      {aba === "comparativo" && (
        // A linha dos controles da tabela cruzada: Linhas, Colunas, Medida, Visão e R$ | %.
        <div className="flex flex-wrap items-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <EsqueletoControle key={i} className="w-full sm:w-44" />
          ))}
          <EsqueletoSegmented itens={2} />
        </div>
      )}
      {aba === "vinculos" && <EsqueletoSegmented itens={2} className="self-start" />}
      <EsqueletoTabela cheia linhas={12} colunas={aba === "visoes" ? 5 : 8} />
    </EsqueletoColunaEspaco>
  );
}
