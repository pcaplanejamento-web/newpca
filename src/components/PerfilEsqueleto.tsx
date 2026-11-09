import { EsqueletoControle, Skeleton } from "./Skeleton";

/**
 * ESQUELETO DO CABEÇALHO DO PERFIL — o MESMO cartão do `PerfilView`: a foto (`Avatar xl`), o nome, o apelido · cargo, os
 * selos (papel, unidade) e o "Sair" à direita; no celular, centralizado. Arquivo leve, sem "use client".
 */
export function EsqueletoCabecalhoPerfil() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring sm:flex-row">
      <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col items-center gap-2 sm:items-start">
        <Skeleton className="h-6 w-56 max-w-full rounded-sm" />
        <Skeleton className="h-3.5 w-40 rounded-sm" />
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-24 rounded-chip" />
          <Skeleton className="h-5 w-20 rounded-chip" />
        </div>
      </div>
      <EsqueletoControle className="w-24" />
    </div>
  );
}
