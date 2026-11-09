import { EsqueletoTela } from "@/components/EsqueletoTela";
import { EsqueletoQuadro } from "@/components/QuadroEsqueleto";

/** O quadro: a moldura até o fim do display (a faixa do topo, as listas lado a lado e a pílula das vistas). */
export default function Carregando() {
  return (
    <EsqueletoTela cheia>
      <EsqueletoQuadro />
    </EsqueletoTela>
  );
}
