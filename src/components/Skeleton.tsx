// Skeleton com shimmer, reutilizável (apresentação — sem estado).
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-md bg-slate-200/70 dark:bg-slate-700/40 ${className}`}
    >
      <div className="animate-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-white/10" />
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
