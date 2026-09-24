import type { ReactNode } from "react";

// Badge de status/categoria, coerente em claro e escuro.
export type Tone =
  | "emerald"
  | "amber"
  | "blue"
  | "red"
  | "orange"
  | "violet"
  | "cyan"
  | "slate";

// Cada tom → um token de cor (semântico/feedback/avatar). As tintas de fundo e
// contorno saem por color-mix na superfície (adapta ao tema e ao accent do ADM);
// o tom "slate" usa o neutro --muted. Fonte única do mapa (reusado no StatCard).
const TONE_VAR: Record<Tone, string> = {
  emerald: "var(--ok)",
  amber: "var(--warn)",
  blue: "var(--info)",
  red: "var(--danger)",
  orange: "var(--sit-devolvido)",
  violet: "var(--nat-comunicacao)",
  cyan: "var(--av-naty)",
  slate: "var(--muted)",
};

/** Cor (CSS var) de um tom do Badge — reutilizável por outros componentes. */
export function toneVar(tone: Tone): string {
  return TONE_VAR[tone];
}

export function Badge({
  children,
  tone = "slate",
  dot = false,
  solid = false,
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  /** `solid` = pílula PREENCHIDA (fundo no tom, texto branco) — p/ chips de MARCA (ex.: Adobe). */
  solid?: boolean;
  className?: string;
}) {
  const c = TONE_VAR[tone];
  // `#fff` aqui é o texto de CONTRASTE sobre um chip colorido sólido (não uma cor neutra de layout).
  const style = solid
    ? { color: "#fff", background: c, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 55%, #000)` }
    : {
        color: c,
        background: `color-mix(in srgb, ${c} 14%, var(--surface))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 28%, transparent)`,
      };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
      style={style}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: solid ? "#fff" : c }} />}
      {children}
    </span>
  );
}
