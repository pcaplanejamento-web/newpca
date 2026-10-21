import { EsqueletoTabela } from "@/components/DataTableEsqueleto";
import { EsqueletoTela } from "@/components/EsqueletoTela";
import { EsqueletoSegmented } from "@/components/SegmentedEsqueleto";
import { EsqueletoControle } from "@/components/Skeleton";

/** A Mesa: a barra (as visões + as ferramentas) e a tabela até o fim do display. */
export default function Carregando() {
  return (
    <EsqueletoTela cheia>
      <div className="flex items-center gap-2">
        <EsqueletoSegmented itens={4} />
        <EsqueletoControle quadrado className="ml-auto" />
        <EsqueletoControle quadrado />
        <EsqueletoControle quadrado />
      </div>
      <EsqueletoTabela cheia linhas={14} colunas={8} />
    </EsqueletoTela>
  );
}
