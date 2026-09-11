import type { ReactNode } from "react";
import type { Tone } from "./Badge";

// Tile de estatística "plano" (superfície neutra + chip colorido). Usado no
// Dashboard. (O KPI do design system é o KpiStat, spec §6.4.)
const CHIP: Record<Tone, string> = {
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  red: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
  orange: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
  cyan: "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300",
  slate: "bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-300",
};

export function StatCard({
  label,
  value,
  icon,
  tone = "slate",
  hint,
  active = false,
  onClick,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const clickable = typeof onClick === "function";
  const Comp = clickable ? "button" : "div";
  return (
    <Comp
      {...(clickable ? { type: "button" as const, onClick } : {})}
      className={`flex items-center gap-3 rounded-card border bg-surface p-4 text-left shadow-ring transition-colors ${
        active ? "border-accent ring-1 ring-accent/40" : "border-border"
      } ${clickable ? "hover:border-border-2" : ""}`}
    >
      {icon && (
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${CHIP[tone]}`}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</div>
        <div className="mt-0.5 text-xl font-bold leading-tight text-text">{value}</div>
        {hint && <div className="truncate text-[11px] text-faint">{hint}</div>}
      </div>
    </Comp>
  );
}
