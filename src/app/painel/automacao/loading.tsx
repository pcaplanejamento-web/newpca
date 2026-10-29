import { EsqueletoGradeEspacos } from "@/components/CartaoEspacoEsqueleto";
import { EsqueletoTela, EsqueletoBarra } from "@/components/EsqueletoTela";

/** A Automação: o título e a grade dos cards dos fluxos. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoBarra controles={0} icones={2} />
      <EsqueletoGradeEspacos quantos={6} />
    </EsqueletoTela>
  );
}
