"use client";

import { type ReactNode, useEffect, useState } from "react";
import { IconInbox } from "../icons";

// Paleta categórica (dados, não neutros) — funciona em tema claro e escuro.
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

const DEFAULTS = {
  axis: "#b5b5aa",
  grid: "#e9e9e2",
  accent: "#4f46e5",
  cursor: "rgba(148,163,184,0.14)",
};

// Eixos/grade/accent dos gráficos LIDOS DOS TOKENS (Recharts precisa de cor
// concreta, não `var()`), reavaliados quando o tema (`data-theme`) ou o preview
// do ADM (style inline no <html>) muda. SSR usa defaults; o cliente resolve.
export function useChartTokens() {
  const [t, setT] = useState(DEFAULTS);
  useEffect(() => {
    const compute = () => {
      const cs = getComputedStyle(document.documentElement);
      const rd = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
      setT({
        axis: rd("--faint", DEFAULTS.axis),
        grid: rd("--border-2", DEFAULTS.grid),
        accent: rd("--accent", DEFAULTS.accent),
        cursor: rd("--track", DEFAULTS.cursor),
      });
    };
    compute();
    const mo = new MutationObserver(compute);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
    return () => mo.disconnect();
  }, []);
  return t;
}

export function ChartEmpty({ label = "Sem dados para exibir" }: { label?: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-2 text-faint">
      <IconInbox className="h-8 w-8" />
      <span className="text-xs">{label}</span>
    </div>
  );
}

export function TooltipBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-control border border-border bg-surface px-3 py-2 text-xs text-text shadow-soft">
      {children}
    </div>
  );
}
