// Constantes compartilhadas de Protocolos (puras — usadas no cliente e no servidor).

// SITUAÇÃO (coluna SITUAÇÃO da planilha)
export const SITUACAO = [
  "em_analise",
  "em_andamento",
  "pendente",
  "finalizado",
] as const;
export type Situacao = (typeof SITUACAO)[number];

export const SITUACAO_LABEL: Record<string, string> = {
  em_analise: "Em análise",
  em_andamento: "Em andamento",
  pendente: "Pendente",
  finalizado: "Finalizado",
};

export const SITUACAO_STYLE: Record<string, string> = {
  em_analise: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  em_andamento: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  pendente: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  finalizado:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
};

export const situacaoLabel = (s?: string | null) =>
  (s && SITUACAO_LABEL[s]) || s || "—";
export const situacaoStyle = (s?: string | null) =>
  (s && SITUACAO_STYLE[s]) ||
  "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

// NATUREZA (coluna NATUREZA — ex.: INCLUSÃO 2027, INCLUSÃO 2026, EXCLUSÃO)
export const NATUREZA_SUGESTOES = ["INCLUSÃO 2027", "INCLUSÃO 2026", "EXCLUSÃO"];

/** Cor por palavra-chave (inclusão = verde/azul por ano; exclusão = vermelho). */
export function naturezaStyle(n?: string | null): string {
  const s = (n ?? "").toUpperCase();
  if (s.includes("EXCLUS"))
    return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300";
  if (s.includes("INCLUS")) {
    return s.includes("2027")
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300";
  }
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}
