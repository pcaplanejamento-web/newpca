/**
 * Núcleo PURO do canal AO VIVO das notificações (sem env → testável): ler o cookie da sessão, conferir a origem do
 * WebSocket (outro site não abre o canal de ninguém) e a espera da reconexão.
 */

/** O valor de um cookie no cabeçalho `Cookie` (vazio = `null`). */
export function lerCookie(cabecalho: string | null | undefined, nome: string): string | null {
  for (const parte of (cabecalho ?? "").split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nome) {
      const v = parte.slice(i + 1).trim();
      try {
        return decodeURIComponent(v) || null;
      } catch {
        return v || null;
      }
    }
  }
  return null;
}

/** O pedido do WebSocket veio do PRÓPRIO site (a origem do navegador = o endereço pedido)? */
export function origemDoProprioSite(origin: string | null | undefined, url: string): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(url).host;
  } catch {
    return false;
  }
}

/** A espera antes de reconectar: 2 s, 4 s, 8 s… até 60 s (com até 20% de folga aleatória, para as abas não baterem juntas). */
export function esperaReconexao(tentativa: number, aleatorio = Math.random()): number {
  const base = Math.min(60_000, 2_000 * 2 ** Math.max(0, tentativa));
  return Math.round(base * (1 + 0.2 * aleatorio));
}

/** Quantas pessoas recebem o aviso AO VIVO por requisição (cada uma é um pedido ao Durable Object) — as demais veem pela consulta. */
export const MAX_AO_VIVO = 25;
/** Abas abertas por pessoa no canal (a mais antiga sai). */
export const MAX_ABAS_AO_VIVO = 10;
