import { EsqueletoBarraCatalogo } from "@/components/CatalogoEsqueleto";
import { EsqueletoTela } from "@/components/EsqueletoTela";

/**
 * O Catálogo: só a barra (vale para qualquer visão). A visão vem no Suspense da página, com o esqueleto da visão pedida
 * (`?vista=`), que este arquivo não consegue ler.
 */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoBarraCatalogo />
    </EsqueletoTela>
  );
}
