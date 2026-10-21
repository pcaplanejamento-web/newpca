import { Skeleton } from "./Skeleton";

/**
 * Esqueleto da `DataTable` — a MESMA moldura (`rounded-card`, borda, anel), o cabeçalho em `bg-surface-2`, as linhas na altura
 * da densidade COMPACTA (`--h-control-sm` no desktop, 44px no toque — a das tabelas da Mesa, de Tarefas e da Automação) e o
 * rodapé com o resumo e a paginação. `cheia` = ocupa até o fim do display no desktop, como a `scrollInterno`. Arquivo leve
 * (sem "use client"): o `loading.tsx` das telas usa sem baixar a tabela.
 */
export function EsqueletoTabela({ linhas = 12, colunas = 6, cheia = false }: { linhas?: number; colunas?: number; cheia?: boolean }) {
  const grade = { gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` };
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-ring ${cheia ? "lg:min-h-0 lg:flex-1" : ""}`}
    >
      <div className="grid h-11 items-center gap-4 border-b border-border bg-surface-2 px-[var(--cell-px)] lg:h-9" style={grade}>
        {Array.from({ length: colunas }).map((_, i) => (
          <Skeleton key={i} className="h-2.5 w-2/3 rounded-sm" />
        ))}
      </div>
      <div className={`divide-y divide-border ${cheia ? "lg:min-h-0 lg:flex-1 lg:overflow-hidden" : ""}`}>
        {Array.from({ length: linhas }).map((_, l) => (
          <div key={l} className="grid h-11 items-center gap-4 px-[var(--cell-px)] lg:h-[var(--h-control-sm)]" style={grade}>
            {Array.from({ length: colunas }).map((_, c) => (
              <Skeleton key={c} className={`h-3 rounded-sm ${(l + c) % 3 === 0 ? "w-1/2" : "w-4/5"}`} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-2 px-3 py-1.5">
        <Skeleton className="h-3 w-32 rounded-sm" />
        <Skeleton className="h-11 w-40 rounded-control lg:h-[var(--h-control-sm)]" />
      </div>
    </div>
  );
}
