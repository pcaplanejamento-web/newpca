import { Skeleton, SkeletonCartao } from "./Skeleton";

export type VarianteEsqueleto = "tabela" | "cartoes" | "calendario";

/**
 * ESQUELETO DE UMA TELA — o que aparece NA HORA ao tocar no menu (o `loading.tsx` da rota), enquanto o servidor monta a
 * página: só a ESTRUTURA (linha de título, barra e a moldura do conteúdo), nos mesmos espaçamentos das telas reais, sem
 * nenhum dado e sem pedir nada ao servidor. `tabela` = título + barra + tabela; `cartoes` = título + grade de cartões (a
 * grade de PCAs, orçamentos, quadros e catálogos); `calendario` = título + barra + a grade do mês.
 */
export function EsqueletoTela({ variante = "tabela" }: { variante?: VarianteEsqueleto }) {
  return (
    <div className="space-y-[var(--gap-block)]" aria-busy="true">
      <span className="sr-only" role="status">Carregando a tela…</span>
      <div className="linha-topico flex items-center gap-3">
        <Skeleton className="h-7 w-48 max-w-[60%]" />
        <Skeleton className="ml-auto h-[var(--h-control-sm)] w-28 max-lg:h-11" />
      </div>
      {variante === "cartoes" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-[var(--gap-block)]">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3] w-full rounded-card" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-[var(--h-control-sm)] w-64 max-w-full max-lg:h-11" />
            <Skeleton className="h-[var(--h-control-sm)] w-[var(--h-control-sm)] max-lg:size-11" />
          </div>
          {variante === "calendario" ? (
            <div className="grid grid-cols-7 gap-1 rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-md lg:h-24" />
              ))}
            </div>
          ) : (
            <SkeletonCartao linhas={10} />
          )}
        </>
      )}
    </div>
  );
}
