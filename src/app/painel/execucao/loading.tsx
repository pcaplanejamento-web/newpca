import { DashboardExecucaoEsqueleto } from "@/components/DashboardExecucaoEsqueleto";
import { EsqueletoTela } from "@/components/EsqueletoTela";

/** Execução: o dashboard (os indicadores abrem a tela). */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <DashboardExecucaoEsqueleto />
    </EsqueletoTela>
  );
}
