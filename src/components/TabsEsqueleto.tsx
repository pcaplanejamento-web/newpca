import { Skeleton, SkeletonLinhas } from "./Skeleton";

/**
 * Esqueleto das `Tabs` LATERAIS SEPARADAS (Configurações, Perfil) — a MESMA disposição: no desktop a lista num cartão de
 * 15rem (`lg:w-60`, `p-2`, itens na altura dos controles) e o conteúdo noutro cartão ao lado; no celular a faixa horizontal
 * das abas sobre o conteúdo. Arquivo leve (as `Tabs` moram num arquivo "use client").
 */
export function EsqueletoTabsLaterais({ abas = 8, linhas = 6 }: { abas?: number; linhas?: number }) {
  return (
    <div className="flex min-h-0 flex-col lg:flex-1 lg:flex-row lg:gap-[var(--gap-block)]">
      <div className="flex shrink-0 gap-1 overflow-hidden border-b border-border lg:w-60 lg:flex-col lg:gap-0.5 lg:self-start lg:rounded-card lg:border lg:bg-surface lg:p-2 lg:shadow-ring">
        {Array.from({ length: abas }).map((_, i) => (
          <div key={i} className="flex min-h-11 w-28 shrink-0 items-center gap-2 px-3 lg:min-h-[var(--h-control-sm)] lg:w-full">
            <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
            <Skeleton className={`h-3 rounded-sm ${i % 2 ? "w-3/5" : "w-4/5"}`} />
          </div>
        ))}
      </div>
      <div className="mt-[var(--gap-block)] min-w-0 flex-1 rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring lg:mt-0 lg:self-start">
        <SkeletonLinhas linhas={linhas} />
      </div>
    </div>
  );
}
