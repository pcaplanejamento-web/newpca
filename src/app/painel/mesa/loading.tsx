import { EsqueletoTabela } from "@/components/DataTableEsqueleto";
import { EsqueletoTela } from "@/components/EsqueletoTela";
import { EsqueletoSegmented } from "@/components/SegmentedEsqueleto";
import { EsqueletoControle } from "@/components/Skeleton";

/** A Mesa: a barra (a Mesa, as visões e os filtros à esquerda; os botões só-ícone à direita) e a tabela até o fim do display. */
export default function Carregando() {
  return (
    <EsqueletoTela cheia>
      <div className="flex flex-wrap items-center gap-2">
        <EsqueletoControle className="w-40" />
        <EsqueletoSegmented itens={4} />
        <div className="ml-auto flex items-center gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <EsqueletoControle key={i} quadrado />
          ))}
        </div>
      </div>
      <EsqueletoTabela cheia linhas={14} colunas={8} />
    </EsqueletoTela>
  );
}
