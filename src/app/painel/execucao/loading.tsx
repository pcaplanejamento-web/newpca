import { DashboardExecucaoEsqueleto } from "@/components/DashboardExecucaoEsqueleto";
import { EsqueletoTela, EsqueletoTitulo } from "@/components/EsqueletoTela";

/** Execução: o título (com as visões, o período e os anos) e o dashboard. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoTitulo />
      <DashboardExecucaoEsqueleto />
    </EsqueletoTela>
  );
}
