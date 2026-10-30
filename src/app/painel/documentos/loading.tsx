import { EsqueletoGradeEspacos } from "@/components/CartaoEspacoEsqueleto";
import { EsqueletoTela, EsqueletoBarra } from "@/components/EsqueletoTela";

/** Documentos: a barra (busca e filtro à esquerda, ajuda à direita) e a grade dos cards. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoBarra icones={1} />
      <EsqueletoGradeEspacos espaco="gap-3" />
    </EsqueletoTela>
  );
}
