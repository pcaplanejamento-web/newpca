import { EsqueletoTela } from "@/components/EsqueletoTela";
import { EsqueletoCabecalhoPerfil } from "@/components/PerfilEsqueleto";
import { EsqueletoTabsLaterais } from "@/components/TabsEsqueleto";

/** O cabeçalho da pessoa (o cartão com a foto, o nome, os selos e o Sair) e as abas laterais (a lista e o conteúdo). */
export default function Carregando() {
  return (
    <EsqueletoTela cheia>
      <EsqueletoCabecalhoPerfil />
      <EsqueletoTabsLaterais />
    </EsqueletoTela>
  );
}
