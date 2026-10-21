import { EsqueletoCalendario } from "@/components/CalendarioEsqueleto";
import { EsqueletoTela } from "@/components/EsqueletoTela";

/** O Calendário: a barra, a lateral e a grade do mês até o fim do display. */
export default function Carregando() {
  return (
    <EsqueletoTela cheia>
      <EsqueletoCalendario />
    </EsqueletoTela>
  );
}
