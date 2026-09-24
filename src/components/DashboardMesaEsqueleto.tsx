import { Skeleton } from "./Skeleton";

/**
 * ESQUELETO do Dashboard de governança da Mesa — a MESMA grade do `DashboardMesa` (5 KPIs + 6 quadros), mostrado
 * enquanto o código dele carrega (ele é baixado sob demanda). Arquivo próprio e leve: a Mesa o importa sem puxar
 * os gráficos junto.
 */
export function DashboardMesaEsqueleto() {
  return (
    <div aria-busy className="space-y-[var(--gap-block)]">
      <div className="grid grid-cols-2 gap-[var(--gap-block)] lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className={`h-[104px] rounded-card ${i === 0 ? "col-span-2 lg:col-span-1" : ""}`} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-[var(--gap-block)] md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-72 rounded-card" />
        ))}
      </div>
    </div>
  );
}
