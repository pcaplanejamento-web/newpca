import type { ReactNode } from "react";
import { IconInbox } from "../icons";

// Paleta categórica (funciona em tema claro e escuro).
export const CHART_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#a855f7", // purple
  "#ef4444", // red
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
  "#f97316", // orange
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#eab308", // yellow
];

export const AXIS = "#94a3b8"; // slate-400
export const GRID = "rgba(148,163,184,0.22)";

export function ChartEmpty({ label = "Sem dados para exibir" }: { label?: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-2 text-slate-400">
      <IconInbox className="h-8 w-8" />
      <span className="text-xs">{label}</span>
    </div>
  );
}

export function TooltipBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-800">
      {children}
    </div>
  );
}
