import { EsqueletoTela } from "@/components/EsqueletoTela";
import { EsqueletoBarraMesa } from "@/components/MesaEsqueleto";

/**
 * A Mesa: só a barra (vale para qualquer visão). A visão (tabela ou Dashboard) vem no Suspense da página, com o esqueleto
 * da visão pedida (`?vista=`), que este arquivo não consegue ler.
 */
export default function Carregando() {
  return (
    <EsqueletoTela cheia>
      <EsqueletoBarraMesa />
    </EsqueletoTela>
  );
}
