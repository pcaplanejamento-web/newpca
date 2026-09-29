import { Skeleton } from "./Skeleton";

/**
 * ESQUELETO de um Dashboard carregado sob demanda — a MESMA grade dele, enquanto o código chega. Arquivo próprio e leve:
 * quem usa o importa sem puxar os gráficos junto. `metricas` = a grade do Dashboard da Mesa (5 KPIs + a barra de
 * métricas + o gráfico + o desempenho por pessoa); sem ela, 5 KPIs + 6 quadros (o Dashboard de Tarefas).
 */
export function DashboardMesaEsqueleto({ metricas = false }: { metricas?: boolean }) {
  return (
    <div aria-busy className="space-y-[var(--gap-block)]">
      <div className="grid grid-cols-2 gap-[var(--gap-block)] lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className={`h-[104px] rounded-card ${i === 0 ? "col-span-2 lg:col-span-1" : ""}`} />
        ))}
      </div>
      {metricas ? (
        <>
          {/* A barra de métricas (3 linhas abaixo de 400px, 2 até o `sm`, 1 depois) + a linha do recorte. */}
          <div className="space-y-1.5">
            <Skeleton className="h-[148px] w-full rounded-control min-[400px]:h-24 sm:h-11 lg:h-[var(--h-control-sm)] lg:max-w-xl" />
            <Skeleton className="h-9 w-full max-w-md rounded-control sm:h-4" />
          </div>
          <Skeleton className="h-80 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </>
      ) : (
        <div className="grid grid-cols-1 gap-[var(--gap-block)] md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-72 rounded-card" />
          ))}
        </div>
      )}
    </div>
  );
}
