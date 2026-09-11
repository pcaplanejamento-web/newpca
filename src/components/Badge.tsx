import type { ReactNode } from "react";
import type { SituacaoProtocolo } from "@/db/schema";

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

/** Tom fixo por situação do protocolo. */
export function situacaoTone(situacao?: SituacaoProtocolo | string | null): Tone {
  switch (situacao) {
    case "finalizado":
      return "emerald";
    case "em_analise":
      return "amber";
    case "em_andamento":
      return "blue";
    case "devolvido":
      return "orange";
    case "cancelado":
      return "slate";
    default:
      return "slate";
  }
}

const AUTO: Tone[] = ["emerald", "blue", "violet", "amber", "orange", "cyan", "red"];

/** Tom determinístico por texto (para naturezas/valores livres). */
export function hashTone(texto?: string | null): Tone {
  if (!texto) return "slate";
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) | 0;
  return AUTO[Math.abs(h) % AUTO.length];
}

/** Tom por natureza — cores fixas para os valores conhecidos (como no print),
 *  com fallback determinístico para valores novos. */
export function naturezaTone(natureza?: string | null): Tone {
  const n = (natureza ?? "").toUpperCase();
  if (n.startsWith("INCLUSÃO 2027") || n.startsWith("INCLUSAO 2027")) return "emerald";
  if (n.startsWith("INCLUSÃO") || n.startsWith("INCLUSAO")) return "amber";
  if (n.startsWith("EXCLUSÃO") || n.startsWith("EXCLUSAO")) return "red";
  if (n.startsWith("CORREÇÃO") || n.startsWith("CORRECAO")) return "blue";
  if (n.startsWith("COMUNICAÇÃO") || n.startsWith("COMUNICACAO")) return "violet";
  return hashTone(natureza);
}

export function Badge({
  children,
  tone = "slate",
  dot = false,
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  const c = TONE_VAR[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
      style={{
        color: c,
        background: `color-mix(in srgb, ${c} 14%, var(--surface))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 28%, transparent)`,
      }}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />}
      {children}
    </span>
  );
}
