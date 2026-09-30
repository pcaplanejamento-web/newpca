/** Os MODOS da tela única de acesso (`/login?modo=`) — puro, usado no servidor (a página) e no cliente (`TelaAcesso`). */
export const MODOS_ACESSO = ["entrar", "cadastro", "senha"] as const;
export type ModoAcesso = (typeof MODOS_ACESSO)[number];

/** O modo pedido na URL (desconhecido ou ausente = "entrar"). */
export function lerModoAcesso(v: string | string[] | undefined): ModoAcesso {
  const m = Array.isArray(v) ? v[0] : v;
  return (MODOS_ACESSO as readonly string[]).includes(m ?? "") ? (m as ModoAcesso) : "entrar";
}
