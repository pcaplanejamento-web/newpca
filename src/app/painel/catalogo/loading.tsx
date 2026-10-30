import { EsqueletoGradeEspacos } from "@/components/CartaoEspacoEsqueleto";
import { EsqueletoTela } from "@/components/EsqueletoTela";
import { EsqueletoSegmented } from "@/components/SegmentedEsqueleto";
import { EsqueletoControle } from "@/components/Skeleton";

/** O Catálogo: as visões à esquerda e "Exportar modelo" à direita; a grade dos cards dos catálogos e das pastas. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <div className="flex flex-wrap items-center gap-2">
        <EsqueletoSegmented itens={4} />
        <EsqueletoControle className="ml-auto w-36" />
      </div>
      <EsqueletoGradeEspacos espaco="gap-3" />
    </EsqueletoTela>
  );
}
