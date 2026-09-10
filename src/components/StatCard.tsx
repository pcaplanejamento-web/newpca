import type { ReactNode } from "react";
import type { Tone } from "./Badge";

// Tile de estatística "plano" (superfície neutra + chip colorido) — o padrão do
// print para Dashboard/Protocolos. Distinto do KpiCard (fundo em gradiente).
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
      className={`flex items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition dark:bg-slate-900 ${
        active
          ? "border-emerald-400 ring-1 ring-emerald-400/40 dark:border-emerald-500/50"
          : "border-slate-200 dark:border-slate-800"
      } ${clickable ? "hover:border-slate-300 hover:shadow dark:hover:border-slate-700" : ""}`}
    >
      {icon && (
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${CHIP[tone]}`}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {label}
        </div>
        <div className="mt-0.5 text-xl font-bold leading-tight text-slate-800 dark:text-white">
          {value}
        </div>
        {hint && (
          <div className="truncate text-[11px] text-slate-400 dark:text-slate-500">
            {hint}
          </div>
        )}
      </div>
    </Comp>
  );
}
