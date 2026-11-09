import { EsqueletoEspaco, EsqueletoTela } from "@/components/EsqueletoTela";
import { EsqueletoAbaPca } from "@/components/PcaEspacoEsqueleto";

/** O espaço do PCA: o voltar, as abas, o ano, o status e a engrenagem — e a aba padrão, o Dashboard (o `loading.tsx` não lê `?aba=`). */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoEspaco abas={5} fim={2} config />
      <EsqueletoAbaPca aba="dashboard" />
    </EsqueletoTela>
  );
}
