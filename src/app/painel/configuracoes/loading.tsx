import { EsqueletoTela, EsqueletoTitulo } from "@/components/EsqueletoTela";
import { EsqueletoTabsLaterais } from "@/components/TabsEsqueleto";

/** O título e as abas laterais (a lista num cartão, o conteúdo noutro). */
export default function Carregando() {
  return (
    <EsqueletoTela cheia>
      <EsqueletoTitulo acao={false} />
      <EsqueletoTabsLaterais />
    </EsqueletoTela>
  );
}
