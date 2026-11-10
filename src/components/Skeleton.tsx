import type { CSSProperties } from "react";

// Skeleton com shimmer, reutilizável (apresentação — sem estado).
export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={`relative overflow-hidden rounded-md bg-border ${className}`} style={style}>
      <div className="animate-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/10" />
    </div>
  );
}

/** Bloco de linhas-skeleton para tabelas/listas. */
export function SkeletonLinhas({ linhas = 6 }: { linhas?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: linhas }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** Moldura de CARTÃO com linhas-skeleton — a espera de uma seção/visão inteira (a mesma moldura do conteúdo). */
export function SkeletonCartao({ linhas = 6 }: { linhas?: number }) {
  return (
    <div className="rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
      <SkeletonLinhas linhas={linhas} />
    </div>
  );
}

/**
 * Esqueleto de um CONTROLE (botão, seletor, campo) na ALTURA PADRÃO dos controles — `--h-control-sm` no desktop, 44px no
 * toque. `quadrado` = o botão só com ícone; senão a largura vem em `className`.
 */
export function EsqueletoControle({ quadrado = false, className = "" }: { quadrado?: boolean; className?: string }) {
  return <Skeleton className={`h-11 rounded-control desktop:h-[var(--h-control-sm)] ${quadrado ? "aspect-square shrink-0" : ""} ${className}`} />;
}
