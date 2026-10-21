import { Skeleton } from "./Skeleton";

/**
 * As COLUNAS da grade dos cards de ESPAÇO (quadros de Tarefas, catálogos, automações): `auto-fill` com o card de no mínimo
 * 15rem. Fonte ÚNICA — a grade real e a do esqueleto usam a mesma (cada tela põe o seu espaçamento).
 */
export const COLUNAS_ESPACOS = "grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))]";

/**
 * Esqueleto do `CartaoEspaco` — o MESMO desenho: a moldura `p-2`, a CAPA 16:9, o sobretítulo, o nome em 2 linhas e as 3
 * métricas no rodapé. Arquivo leve (o `CartaoEspaco` mora num arquivo "use client").
 */
export function EsqueletoCartaoEspaco() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-card border border-border bg-surface p-2 shadow-ring">
      <Skeleton className="aspect-video w-full rounded-lg" />
      <div className="flex flex-1 flex-col px-1.5 pt-2 pb-1">
        <Skeleton className="h-2.5 w-1/3 rounded-sm" />
        <div className="mt-1.5 min-h-[2.5em] space-y-1.5 text-[14px]">
          <Skeleton className="h-3.5 w-11/12 rounded-sm" />
          <Skeleton className="h-3.5 w-2/3 rounded-sm" />
        </div>
        <div className="mt-auto grid grid-cols-3 gap-x-2 border-t border-border pt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-2.5 w-3/4 rounded-sm" />
              <Skeleton className="h-4 w-1/2 rounded-sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A GRADE de esqueletos de cartões de espaço (`quantos` cards), com o espaçamento da tela. */
export function EsqueletoGradeEspacos({ quantos = 8, espaco = "gap-[var(--gap-block)]" }: { quantos?: number; espaco?: string }) {
  return (
    <div className={`grid ${COLUNAS_ESPACOS} ${espaco}`}>
      {Array.from({ length: quantos }).map((_, i) => (
        <EsqueletoCartaoEspaco key={i} />
      ))}
    </div>
  );
}
