/**
 * AVISOS DO SISTEMA (navegador, fora do React — o mesmo padrão dos outros armazéns): a VERSÃO NOVA publicada com a página
 * aberta (o código desta aba é o antigo — um fluxo gravado pela versão nova pode usar um componente que esta não conhece)
 * e a SESSÃO que terminou (inatividade, saída em outro aparelho): as telas avisam e o `AvisosDoSistema` mostra UMA vez.
 */
import { VERSAO_ATUAL } from "./versoes.ts";

type Estado = { versaoNova: string | null; sessaoTerminou: boolean };
let estado: Estado = { versaoNova: null, sessaoTerminou: false };
const ouvintes = new Set<() => void>();
const mudar = (novo: Partial<Estado>) => {
  const prox = { ...estado, ...novo };
  if (prox.versaoNova === estado.versaoNova && prox.sessaoTerminou === estado.sessaoTerminou) return;
  estado = prox;
  for (const f of ouvintes) f();
};

export const assinarAvisosSistema = (f: () => void) => {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
};
export const avisosSistema = (): Estado => estado;
const INICIAL: Estado = { versaoNova: null, sessaoTerminou: false };
export const avisosSistemaNoServidor = (): Estado => INICIAL;

/** A versão que o SERVIDOR informou: diferente da desta página = há uma versão nova (recarregar traz o código novo). */
export function versaoDoServidor(v: unknown): void {
  if (typeof v !== "string" || !v) return;
  if (v !== VERSAO_ATUAL) mudar({ versaoNova: v });
}

/** A sessão do sistema terminou (um pedido voltou 401). */
export function sessaoDoSistemaTerminou(): void {
  mudar({ sessaoTerminou: true });
}

/** Pede ao `SincronizarDados` uma conferência AGORA (ex.: a tela achou algo de uma versão mais nova). */
export const EVENTO_CONFERIR_VERSAO = "pca:conferir-versao";
export function conferirVersaoAgora(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_CONFERIR_VERSAO));
}

/** O texto de um erro de API: 401 = a sessão terminou (avisa e diz o que fazer); senão o erro dado. */
export const MSG_SESSAO_TERMINOU = "Sua sessão no sistema terminou — entre de novo.";
