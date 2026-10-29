import { EsqueletoTabela } from "@/components/DataTableEsqueleto";
import { EsqueletoEspaco, EsqueletoIndicadores, EsqueletoTela } from "@/components/EsqueletoTela";

/** O espaço do PCA: a linha do espaço (nome, ano, status e as abas) e o Dashboard — os indicadores e a consulta. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoEspaco abas={5} />
      <EsqueletoIndicadores />
      <EsqueletoTabela linhas={10} colunas={8} />
    </EsqueletoTela>
  );
}
