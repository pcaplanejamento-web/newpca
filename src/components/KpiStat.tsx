import type { ReactNode } from "react";

// KPI card (spec §6.4): barra de acento à esquerda, número em Geist com
// tabular-nums, delta com seta (SEM pílula), mini-gráfico de 7 barras (as 2
// últimas na cor do KPI), sublegenda. Tudo por token; elevação por --ring.
export function KpiStat({
  label,
  value,
  cor = "var(--accent)",
  delta,
  spark,
  hint,
}: {
  label: string;
  value: ReactNode;
  cor?: string;
  delta?: { dir: "up" | "down"; value: string };
  spark?: number[];
  hint?: string;
}) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
      <span
        aria-hidden
        className="absolute bottom-4 left-0 top-4 w-[3px] rounded-r-[3px]"
        style={{ background: cor }}
      />
      <div className="flex items-start justify-between gap-2 pl-2">
        <span className="truncate text-[12.5px] text-muted">{label}</span>
        {delta && (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 text-[12.5px] font-semibold"
            style={{ color: delta.dir === "up" ? "var(--delta-up)" : "var(--delta-down)" }}
          >
            {delta.dir === "up" ? "↑" : "↓"} {delta.value}
          </span>
        )}
      </div>
      <div className="mt-1 pl-2 text-[33px] font-bold leading-[0.95] tracking-[-0.03em] text-text tabular-nums">
        {value}
      </div>
      {spark && spark.length > 0 && (
        <div className="mt-3 flex h-7 items-end gap-[3px] pl-2">
          {spark.map((h, i) => (
            <span
              key={i}
              className="w-[5px] shrink-0 rounded-[1px]"
              style={{
                height: `${Math.max(6, Math.min(100, h))}%`,
                background: i >= spark.length - 2 ? cor : "var(--kpi-bar)",
              }}
            />
          ))}
        </div>
      )}
      {hint && <div className="mt-2 truncate pl-2 text-[11.5px] text-faint">{hint}</div>}
    </div>
  );
}
