import { EsqueletoGradeEspacos } from "@/components/CartaoEspacoEsqueleto";
import { EsqueletoTela, EsqueletoTitulo } from "@/components/EsqueletoTela";

/** Tarefas: o título e a grade dos cards dos quadros. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoTitulo />
      <EsqueletoGradeEspacos espaco="gap-3" />
    </EsqueletoTela>
  );
}
