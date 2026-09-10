// Constantes compartilhadas de Protocolos (puras — sem dependências de servidor,
// podem ser importadas por componentes cliente e por rotas de API).

export const STATUS_PROTOCOLO = [
  "recebido",
  "em_andamento",
  "aguardando",
  "concluido",
  "arquivado",
] as const;
export type StatusProtocolo = (typeof STATUS_PROTOCOLO)[number];

export const STATUS_LABEL: Record<StatusProtocolo, string> = {
  recebido: "Recebido",
  em_andamento: "Em andamento",
  aguardando: "Aguardando",
  concluido: "Concluído",
  arquivado: "Arquivado",
};

export const STATUS_STYLE: Record<StatusProtocolo, string> = {
  recebido: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  em_andamento:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  aguardando:
    "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  concluido:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  arquivado: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

export const PRIORIDADE_PROTOCOLO = ["baixa", "media", "alta"] as const;
export type PrioridadeProtocolo = (typeof PRIORIDADE_PROTOCOLO)[number];

export const PRIORIDADE_LABEL: Record<PrioridadeProtocolo, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

export const PRIORIDADE_STYLE: Record<PrioridadeProtocolo, string> = {
  baixa: "text-slate-500 dark:text-slate-400",
  media: "text-amber-600 dark:text-amber-400",
  alta: "text-red-600 dark:text-red-400",
};
