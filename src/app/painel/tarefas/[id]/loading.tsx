import { EsqueletoTela } from "@/components/EsqueletoTela";
import { EsqueletoQuadro } from "@/components/QuadroEsqueleto";

/**
 * O quadro: a moldura até o fim do display (a faixa do topo e a pílula das vistas) — vale para QUALQUER aba. O conteúdo
 * vem no Suspense da página, com o esqueleto da aba pedida (`?aba=`), que este arquivo não consegue ler.
 */
export default function Carregando() {
  return (
    <EsqueletoTela cheia>
      <EsqueletoQuadro aba={null} />
    </EsqueletoTela>
  );
}
