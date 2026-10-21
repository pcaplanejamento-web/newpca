import { EsqueletoControle, Skeleton } from "./Skeleton";

/**
 * Esqueleto do `CalendarioTarefas` (vista Mês) — a MESMA disposição: a barra (Hoje · ‹ › · o período · vistas · Criar), a
 * lateral de 16,5rem no desktop (os números, o mini-mês e os conjuntos) e a grade do mês num cartão (cabeçalho dos dias +
 * 6 semanas). Arquivo leve (o calendário mora num arquivo "use client").
 */
export function EsqueletoCalendario() {
  return (
    <div className="flex min-h-0 flex-col gap-[var(--gap-block)] lg:flex-1">
      <div className="flex items-center gap-2">
        <EsqueletoControle className="w-16" />
        <EsqueletoControle quadrado />
        <EsqueletoControle quadrado />
        <Skeleton className="h-5 w-40 rounded-sm" />
        <EsqueletoControle className="ml-auto w-24" />
        <EsqueletoControle className="w-24" />
      </div>
      <div className="flex min-h-0 gap-[var(--gap-block)] lg:flex-1">
        <div className="hidden w-[16.5rem] shrink-0 space-y-[var(--gap-block)] lg:block">
          <Skeleton className="h-14 w-full rounded-card" />
          <Skeleton className="aspect-square w-full rounded-card" />
          <Skeleton className="h-40 w-full rounded-card" />
        </div>
        <div className="flex min-h-[28rem] min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-ring">
          <div className="grid grid-cols-7 border-b border-border py-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="mx-auto h-2.5 w-8 rounded-sm" />
            ))}
          </div>
          <div className="grid flex-1 grid-cols-7 grid-rows-6">
            {Array.from({ length: 42 }).map((_, i) => (
              <div key={i} className="space-y-1.5 border-r border-b border-border p-1.5">
                <Skeleton className="h-3 w-5 rounded-sm" />
                {i % 4 === 1 && <Skeleton className="h-4 w-full rounded-[4px]" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
