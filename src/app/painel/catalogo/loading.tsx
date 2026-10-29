import { EsqueletoGradeEspacos } from "@/components/CartaoEspacoEsqueleto";
import { EsqueletoTela, EsqueletoBarra } from "@/components/EsqueletoTela";

/** O Catálogo: o título e a grade dos cards dos catálogos e das pastas. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoBarra controles={1} icones={2} />
      <EsqueletoGradeEspacos espaco="gap-3" />
    </EsqueletoTela>
  );
}
