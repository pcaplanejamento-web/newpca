import type { CSSProperties, ReactNode } from "react";
import { type Tone, toneVar } from "./Badge";

// Tile de estatística "plano" (superfície neutra + chip colorido). Usado no
// Dashboard. (O KPI do design system é o KpiStat, spec §6.4.) O chip usa o token
// do tom (color-mix na superfície), reaproveitando o mapa único do Badge.
function chipStyle(tone: Tone): CSSProperties {
  const c = toneVar(tone);
  return { color: c, background: `color-mix(in srgb, ${c} 14%, var(--surface))` };
}

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
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={chipStyle(tone)}
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
