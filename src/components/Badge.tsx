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

const TONES: Record<Tone, string> = {
  emerald:
    "bg-emerald-100 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20",
  amber:
    "bg-amber-100 text-amber-700 ring-amber-600/10 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/20",
  blue:
    "bg-blue-100 text-blue-700 ring-blue-600/10 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/20",
  red:
    "bg-red-100 text-red-700 ring-red-600/10 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-400/20",
  orange:
    "bg-orange-100 text-orange-700 ring-orange-600/10 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/20",
  violet:
    "bg-violet-100 text-violet-700 ring-violet-600/10 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/20",
  cyan:
    "bg-cyan-100 text-cyan-700 ring-cyan-600/10 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-400/20",
  slate:
    "bg-slate-100 text-slate-600 ring-slate-600/10 dark:bg-slate-700/50 dark:text-slate-300 dark:ring-slate-400/10",
};

const DOT: Record<Tone, string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  violet: "bg-violet-500",
  cyan: "bg-cyan-500",
  slate: "bg-slate-400",
};

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
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONES[tone]} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />}
      {children}
    </span>
  );
}
