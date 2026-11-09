import { EsqueletoEspaco, EsqueletoTela } from "@/components/EsqueletoTela";
import { EsqueletoAbaOrcamento } from "@/components/OrcamentoEspacoEsqueleto";

/** O espaço do orçamento: o voltar, as abas e o excluir; abaixo, a aba padrão (Lançamentos: os indicadores e a tabela). */
export default function Carregando() {
  return (
    <EsqueletoTela cheia>
      <EsqueletoEspaco abas={4} config />
      <EsqueletoAbaOrcamento aba="lancamentos" />
    </EsqueletoTela>
  );
}
