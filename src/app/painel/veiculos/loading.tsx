import { EsqueletoTela } from "@/components/EsqueletoTela";
import { EsqueletoFrota } from "@/components/FrotaEsqueleto";

/** O MESMO esqueleto que a tela mostra enquanto os dados chegam (`EsqueletoFrota`) — um só, sem troca no meio. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoFrota tipo="veiculos" />
    </EsqueletoTela>
  );
}
