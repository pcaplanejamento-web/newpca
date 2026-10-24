import type { CSSProperties, ReactNode } from "react";

/**
 * Mini banner de estatística para o HEAD de um documento (DFD/Protocolo) — um por
 * informação (ex.: "Total de itens", "Valor total", "Total de DFDs"). Compacto
 * (rótulo + valor + dica opcional), todo por token; `tone` colore o valor para
 * destacar um estado (ex.: divergência de valor em `danger`). Uma linha destes em
 * `grid` compõe o cabeçalho — sem cartão ad-hoc nas telas. O VALOR é proporcional à LARGURA do próprio cartão
 * (container query, como o `KpiStat`): cabe INTEIRO em qualquer tela — nunca reticências.
 */
const TONE_COR: Record<string, string> = {
  default: "var(--text)",
  accent: "var(--accent)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
};

export function StatMini({
  label,
  value,
  hint,
  tone = "default",
  className = "",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "accent" | "ok" | "warn" | "danger";
  /** Utilitários extra (ex.: `col-span-2 sm:col-span-1` p/ ocupar a linha no mobile). */
  className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring [container-type:inline-size] ${className}`}>
      <div className="truncate text-xs text-muted">{label}</div>
      <div
        className="mt-0.5 min-w-0 text-[clamp(0.78rem,10.5cqw,1.125rem)] font-bold leading-tight tracking-[-0.01em] tabular-nums [overflow-wrap:anywhere]"
        style={{ color: TONE_COR[tone] } as CSSProperties}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-faint">{hint}</div>}
    </div>
  );
}
