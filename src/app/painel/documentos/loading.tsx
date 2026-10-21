import { EsqueletoGradeEspacos } from "@/components/CartaoEspacoEsqueleto";
import { EsqueletoTela, EsqueletoTitulo } from "@/components/EsqueletoTela";

/** Documentos: o título, a área de envio e a grade dos cards. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoTitulo />
      <EsqueletoGradeEspacos espaco="gap-3" />
    </EsqueletoTela>
  );
}
