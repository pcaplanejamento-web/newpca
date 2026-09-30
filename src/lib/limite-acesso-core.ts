/**
 * LIMITE DE TENTATIVAS do acesso — regras PURAS (a contagem vive em `limites_acesso`, por `limite-acesso-sql.ts`). Cada
 * regra conta numa JANELA fixa: passou do máximo, a chave fica bloqueada até a janela acabar.
 */

export type RegraLimite = { max: number; janelaS: number };

/** As regras (por IP e por e-mail). O login por e-mail conta só as FALHAS (e zera ao entrar). */
export const LIMITES_ACESSO = {
  /** Qualquer tentativa de login do mesmo IP. */
  loginIp: { max: 30, janelaS: 15 * 60 },
  /** Senha errada na MESMA conta (qualquer IP) — protege a conta de força bruta distribuída. */
  loginEmail: { max: 8, janelaS: 15 * 60 },
  /** Pedidos de código por e-mail do mesmo IP. */
  codigoIp: { max: 10, janelaS: 60 * 60 },
  /** Pedidos de código para o MESMO e-mail. */
  codigoEmail: { max: 6, janelaS: 60 * 60 },
  /** Cadastros tentados do mesmo IP. */
  cadastroIp: { max: 10, janelaS: 60 * 60 },
  /** Redefinições de senha tentadas do mesmo IP. */
  senhaIp: { max: 20, janelaS: 15 * 60 },
  /** Desafios da verificação anti-robô pedidos pelo mesmo IP. */
  desafioIp: { max: 60, janelaS: 10 * 60 },
} as const satisfies Record<string, RegraLimite>;

export type TipoLimite = keyof typeof LIMITES_ACESSO;

/** A chave da contagem: o tipo + o sujeito (IP ou e-mail), sem caixa. */
export function chaveLimite(tipo: TipoLimite, sujeito: string): string {
  return `${tipo}:${sujeito.trim().toLowerCase().slice(0, 200)}`;
}

/** O início de uma janela ainda válida tem de ser MAIOR que este corte (segundos Unix). */
export function corteJanela(agoraS: number, regra: RegraLimite): number {
  return agoraS - regra.janelaS;
}

/** Quantos segundos faltam para liberar (0 = liberado), dada a contagem da janela que começou em `inicio`. */
export function esperaLimite(contagem: number, inicio: number, agoraS: number, regra: RegraLimite): number {
  if (contagem <= regra.max) return 0;
  return Math.max(0, inicio + regra.janelaS - agoraS);
}

/** A mensagem do bloqueio, com a espera em minutos. */
export function mensagemLimite(esperarS: number): string {
  const min = Math.max(1, Math.ceil(esperarS / 60));
  return `Muitas tentativas. Aguarde ${min} min e tente de novo.`;
}
