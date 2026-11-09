import { EsqueletoControle } from "./Skeleton";

/**
 * ESQUELETO DO `FiltrosDashboard` — dentro da moldura do cartão dos filtros. `grade` = o modo em colunas (a Execução e a
 * Frota: as MESMAS colunas, até 2 × 7 ou 2 × 8 na tela larga); sem ele, a linha única (o Dashboard do PCA: cada filtro
 * divide o espaço, sem quebra no xl, e no `fim` os botões só-ícone). Arquivo leve, sem "use client".
 */
export function EsqueletoFiltrosDashboard({ grade = false, campos, fim = 0 }: { grade?: boolean; campos: number; fim?: number }) {
  const moldura = "rounded-card border border-border bg-surface p-[var(--pad-card)]";
  if (grade) {
    const largas = campos > 14 ? "2xl:grid-cols-8" : "2xl:grid-cols-7";
    return (
      <div className={`grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 ${largas} ${moldura}`}>
        {Array.from({ length: campos }, (_, i) => (
          <EsqueletoControle key={i} className="w-full" />
        ))}
      </div>
    );
  }
  return (
    <div className={`flex flex-wrap items-center gap-2 xl:flex-nowrap ${moldura}`}>
      {Array.from({ length: campos }, (_, i) => (
        <EsqueletoControle key={i} className="min-w-0 flex-1 basis-44" />
      ))}
      {fim > 0 && (
        <div className="flex shrink-0 items-center gap-1.5">
          {Array.from({ length: fim }, (_, i) => (
            <EsqueletoControle key={i} quadrado />
          ))}
        </div>
      )}
    </div>
  );
}
