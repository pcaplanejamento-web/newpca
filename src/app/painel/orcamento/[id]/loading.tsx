import { EsqueletoTabela } from "@/components/DataTableEsqueleto";
import { EsqueletoEspaco, EsqueletoTela } from "@/components/EsqueletoTela";

/** O espaço do orçamento: a linha do espaço (nome, ano, números e as abas) e a tabela dos lançamentos. */
export default function Carregando() {
  return (
    <EsqueletoTela cheia>
      <EsqueletoEspaco abas={4} />
      <EsqueletoTabela cheia linhas={14} colunas={8} />
    </EsqueletoTela>
  );
}
