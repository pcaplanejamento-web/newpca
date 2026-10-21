import { Skeleton } from "./Skeleton";

/**
 * Esqueleto do `Segmented` — o MESMO trilho (`rounded-segment`, `p-[3px]`, o anel interno) com `itens` pílulas na altura
 * dos itens reais (38px no toque, `--h-control-sm` − 6px no desktop).
 */
export function EsqueletoSegmented({ itens = 3, className = "" }: { itens?: number; className?: string }) {
  return (
    <div className={`inline-flex max-w-full gap-0.5 rounded-segment bg-surface-2 p-[3px] shadow-[inset_0_0_0_1px_var(--border)] ${className}`}>
      {Array.from({ length: itens }).map((_, i) => (
        <Skeleton key={i} className={`h-[38px] rounded-chip lg:h-[calc(var(--h-control-sm)-6px)] ${i % 2 ? "w-16" : "w-20"}`} />
      ))}
    </div>
  );
}
