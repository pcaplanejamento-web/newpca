import { EsqueletoGradeEspacos } from "@/components/CartaoEspacoEsqueleto";
import { EsqueletoTela, EsqueletoBarra } from "@/components/EsqueletoTela";

/** Tarefas: a grade dos cards dos quadros. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoBarra controles={0} icones={1} />
      <EsqueletoGradeEspacos espaco="gap-3" />
    </EsqueletoTela>
  );
}
