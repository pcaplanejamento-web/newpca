import { Skeleton } from "./Skeleton";

/**
 * As COLUNAS da grade dos cards de ESPAÇO (quadros de Tarefas, catálogos, automações): `auto-fill` com o card de no mínimo
 * 15rem. Fonte ÚNICA — a grade real e a do esqueleto usam a mesma (cada tela põe o seu espaçamento).
 */
export const COLUNAS_ESPACOS = "grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))]";

/**
 * Esqueleto do `CartaoEspaco` — o MESMO desenho: a mesma ESCALA (`.cartao-escala`), a CAPA 16:9, o sobretítulo, o nome e as 3
 * métricas no rodapé. Arquivo leve (o `CartaoEspaco` mora num arquivo "use client").
 */
export function EsqueletoCartaoEspaco() {
  return (
    <div className="h-full [container-type:inline-size]">
      <div className="cartao-escala flex h-full w-full flex-col overflow-hidden rounded-card border border-border bg-surface shadow-ring">
        <Skeleton className="aspect-video w-full rounded-lg" />
        <div className="ce-corpo flex flex-1 flex-col">
          <div className="ce-sobre">
            <Skeleton className="h-[0.9em] w-1/3 rounded-sm" />
          </div>
          <div className="ce-nome space-y-[0.4em]">
            <Skeleton className="h-[1em] w-11/12 rounded-sm" />
            <Skeleton className="h-[1em] w-2/3 rounded-sm" />
          </div>
          <div className="ce-metricas mt-auto flex justify-between border-t border-border">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-1/4 space-y-[0.3em]">
                <Skeleton className="h-[0.9em] w-full rounded-sm" />
                <Skeleton className="h-[1.3em] w-2/3 rounded-sm" />
              </div>
            ))}
          </div>
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
