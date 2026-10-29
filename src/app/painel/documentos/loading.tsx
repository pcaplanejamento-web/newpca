import { EsqueletoGradeEspacos } from "@/components/CartaoEspacoEsqueleto";
import { EsqueletoTela, EsqueletoBarra } from "@/components/EsqueletoTela";

/** Documentos: o título, a área de envio e a grade dos cards. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoBarra icones={1} />
      <EsqueletoGradeEspacos espaco="gap-3" />
    </EsqueletoTela>
  );
}
