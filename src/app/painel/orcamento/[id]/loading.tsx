import { EsqueletoTabela } from "@/components/DataTableEsqueleto";
import { EsqueletoEspaco, EsqueletoIndicadores, EsqueletoTela } from "@/components/EsqueletoTela";

/** O espaço do orçamento: o voltar e as abas, os indicadores e a tabela dos lançamentos. */
export default function Carregando() {
  return (
    <EsqueletoTela cheia>
      <EsqueletoEspaco abas={4} />
      <EsqueletoIndicadores />
      <EsqueletoTabela cheia linhas={12} colunas={8} />
    </EsqueletoTela>
  );
}
