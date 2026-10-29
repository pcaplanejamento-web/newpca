import { EsqueletoTabela } from "@/components/DataTableEsqueleto";
import { EsqueletoTela, EsqueletoTitulo } from "@/components/EsqueletoTela";

/** A tela dos dados: o título e a tabela até o fim do display (a mesma moldura da `DataTable`). */
export default function Carregando() {
  return (
    <EsqueletoTela cheia>
      <EsqueletoTitulo />
      <EsqueletoTabela cheia linhas={14} colunas={8} />
    </EsqueletoTela>
  );
}
