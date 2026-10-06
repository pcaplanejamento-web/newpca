"use client";

import { type ReactNode, useEffect, useState } from "react";
import { IconInbox } from "../icons";

// Paleta categórica = os tokens --serie-1…8 (globals.css, com a variante do tema escuro). As peças em HTML usam o
// `var()` direto (`corSerie`); o Recharts precisa da cor RESOLVIDA (`useChartTokens().serie`).
export const N_SERIES = 8;
export const corSerie = (i: number): string => `var(--serie-${(((i % N_SERIES) + N_SERIES) % N_SERIES) + 1})`;
const SERIE_PADRAO = ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];

const DEFAULTS = {
  axis: "#b5b5aa",
  grid: "#e9e9e2",
  accent: "#4f46e5",
  cursor: "rgba(148,163,184,0.14)",
  serie: SERIE_PADRAO,
  texto: "#14161b",
  muted: "#6b7280",
  fundo: "#ffffff",
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
        serie: SERIE_PADRAO.map((c, i) => rd(`--serie-${i + 1}`, c)),
        texto: rd("--text", DEFAULTS.texto),
        muted: rd("--muted", DEFAULTS.muted),
        fundo: rd("--surface", DEFAULTS.fundo),
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
