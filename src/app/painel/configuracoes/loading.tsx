import { EsqueletoTela } from "@/components/EsqueletoTela";
import { EsqueletoTabsLaterais } from "@/components/TabsEsqueleto";

/** as abas laterais (a lista num cartão, o conteúdo noutro). */
export default function Carregando() {
  return (
    <EsqueletoTela cheia>
      <EsqueletoTabsLaterais />
    </EsqueletoTela>
  );
}
