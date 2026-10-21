import { EsqueletoGradeEspacos } from "@/components/CartaoEspacoEsqueleto";
import { EsqueletoTela, EsqueletoTitulo } from "@/components/EsqueletoTela";

/** A Automação: o título e a grade dos cards dos fluxos. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoTitulo />
      <EsqueletoGradeEspacos quantos={6} />
    </EsqueletoTela>
  );
}
