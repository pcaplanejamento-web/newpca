import type { CSSProperties, ReactNode } from "react";

/**
 * Mini banner de estatística para o HEAD de um documento (DFD/Protocolo) — um por
 * informação (ex.: "Total de itens", "Valor total", "Total de DFDs"). Compacto
 * (rótulo + valor + dica opcional), todo por token; `tone` colore o valor para
 * destacar um estado (ex.: divergência de valor em `danger`). Uma linha destes em
 * `grid` compõe o cabeçalho — sem cartão ad-hoc nas telas.
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
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "accent" | "ok" | "warn" | "danger";
}) {
  return (
    <div className="min-w-0 rounded-card border border-border bg-surface p-4 shadow-ring">
      <div className="truncate text-xs text-muted">{label}</div>
      <div
        className="mt-0.5 truncate text-lg font-bold leading-tight tabular-nums"
        style={{ color: TONE_COR[tone] } as CSSProperties}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-faint">{hint}</div>}
    </div>
  );
}
