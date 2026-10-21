import { EsqueletoGradeEspacos } from "@/components/CartaoEspacoEsqueleto";
import { EsqueletoTela, EsqueletoTitulo } from "@/components/EsqueletoTela";

/** O Catálogo: o título e a grade dos cards dos catálogos e das pastas. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoTitulo />
      <EsqueletoGradeEspacos espaco="gap-3" />
    </EsqueletoTela>
  );
}
