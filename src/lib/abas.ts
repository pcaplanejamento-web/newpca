// Abas de módulo que uma PERMISSÃO pode liberar (gate de navegação). Módulo puro
// (sem deps de servidor) — usado no cliente (telas de RBAC) e no servidor.
export const ABA_KEYS = ["dashboard", "protocolos", "pca"] as const;
export type AbaKey = (typeof ABA_KEYS)[number];

export const ABAS: { key: AbaKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "protocolos", label: "Protocolos" },
  { key: "pca", label: "PCA" },
];
