import { DashboardExecucaoEsqueleto } from "@/components/DashboardExecucaoEsqueleto";
import { EsqueletoTela } from "@/components/EsqueletoTela";

/** Frotas: os indicadores, os filtros e os gráficos (a mesma grade do painel da Execução). */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <DashboardExecucaoEsqueleto />
    </EsqueletoTela>
  );
}
