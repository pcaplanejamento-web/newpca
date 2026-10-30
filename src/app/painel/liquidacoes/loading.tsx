import { EsqueletoTabela } from "@/components/DataTableEsqueleto";
import { EsqueletoBarra, EsqueletoIndicadores, EsqueletoTela } from "@/components/EsqueletoTela";

/** Os indicadores primeiro (a tela não tem título), a barra (o ano à esquerda; recarregar e ajuda à direita) e a tabela. */
export default function Carregando() {
  return (
    <EsqueletoTela cheia>
      <EsqueletoIndicadores />
      <EsqueletoBarra icones={3} />
      <EsqueletoTabela cheia linhas={12} colunas={8} />
    </EsqueletoTela>
  );
}
