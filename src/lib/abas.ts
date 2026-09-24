// Abas de módulo que uma PERMISSÃO pode liberar (gate de navegação). Módulo puro (sem deps de servidor) — usado no
// cliente (navegação, telas de RBAC) e no servidor. A ORDEM é a da navegação: a 1ª liberada é a porta de entrada do
// painel (`/painel` → a Mesa, onde ficam os protocolos, os DFDs e os itens).
export const ABA_KEYS = ["dfd", "pca", "catalogo", "orcamento"] as const;
export type AbaKey = (typeof ABA_KEYS)[number];

export const ABAS: { key: AbaKey; label: string; href: string }[] = [
  { key: "dfd", label: "Mesa", href: "/painel/mesa" },
  { key: "pca", label: "PCA", href: "/painel/pca" },
  { key: "catalogo", label: "Catálogo", href: "/painel/catalogo" },
  { key: "orcamento", label: "Orçamento", href: "/painel/orcamento" },
];

const CONHECIDAS = new Set<string>(ABA_KEYS);

/** Só as abas que EXISTEM, sem repetir — uma permissão antiga pode guardar chaves de módulos removidos (ex.: o
 * Dashboard e os Protocolos legados): somem na leitura, e o ADM salva a permissão sem erro. */
export function abasConhecidas(lista: unknown): AbaKey[] {
  if (!Array.isArray(lista)) return [];
  return [...new Set(lista.filter((x): x is AbaKey => typeof x === "string" && CONHECIDAS.has(x)))];
}

/** Rota de entrada do painel: a 1ª aba liberada (na ordem da navegação); sem nenhuma, o Perfil. */
export function rotaInicial(liberadas: ReadonlySet<string>): string {
  return ABAS.find((a) => liberadas.has(a.key))?.href ?? "/painel/perfil";
}
