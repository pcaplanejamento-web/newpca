import { EsqueletoGradeEspacos } from "@/components/CartaoEspacoEsqueleto";
import { EsqueletoEspaco, EsqueletoIndicadores, EsqueletoTela } from "@/components/EsqueletoTela";

/** A pasta do catálogo: o voltar e as visões, os indicadores da pasta e a grade dos catálogos. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoEspaco abas={2} />
      <EsqueletoIndicadores />
      <EsqueletoGradeEspacos espaco="gap-3" />
    </EsqueletoTela>
  );
}
