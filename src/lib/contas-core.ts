/**
 * VÁRIAS CONTAS no mesmo navegador (núcleo puro, testado): as sessões das OUTRAS contas ficam no cookie httpOnly
 * `pca_contas` (só os TOKENS — o banco guarda o hash, como o `pca_session`). Nada daqui chega ao navegador em texto.
 */
export const COOKIE_CONTAS = "pca_contas";
/** Quantas contas além da ativa o aparelho guarda. */
export const MAX_CONTAS = 4;

const TOKEN = /^[0-9a-f]{64}$/;

/** Lê o cookie (tolerante: qualquer coisa inválida some; sem repetir; no máximo `MAX_CONTAS`). */
export function lerContas(v: string | undefined | null): string[] {
  if (!v) return [];
  const fora = new Set<string>();
  for (const t of v.split(".")) if (TOKEN.test(t) && fora.size < MAX_CONTAS) fora.add(t);
  return [...fora];
}

/** O valor do cookie (vazio = apagar). */
export function textoContas(tokens: readonly string[]): string {
  return lerContas(tokens.join(".")).join(".");
}

/**
 * As chaves do APARELHO (localStorage) com conteúdo de UMA pessoa (o que ela pesquisou, abriu, conversou) — limpas ao
 * trocar de conta e ao sair, para a outra conta nunca ver. As preferências do aparelho (tema, menu, colunas) ficam.
 */
export const CHAVES_PESSOAIS = [
  "pesquisa:recentes",
  "pesquisa:favoritos",
  "trilha:recentes",
  "tarefas:quadros-recentes",
  "tarefas:pasta-aberta",
  "chat:bolhas",
  "chat:posicoes",
  "chat:posicao",
  "chat:fixada",
  "segundo-plano:posicao",
  "segundo-plano:bolha",
  "automacao:disparo",
] as const;

/** A chave que avisa as OUTRAS abas que a conta ativa mudou (elas recarregam — nada fica à vista da conta anterior). */
export const CHAVE_CONTA_ATIVA = "sessao:conta";
