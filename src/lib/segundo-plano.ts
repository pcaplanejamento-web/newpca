import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Roda `p` depois da resposta (o Worker espera — `waitUntil`); fora do Worker, só dispara. Um erro vira log, nunca lança. */
export function depoisDaResposta(p: Promise<unknown>, rotulo = "segundo plano") {
  const seguro = p.catch((e) => console.error(`[${rotulo}] falha em segundo plano:`, e));
  try {
    getCloudflareContext().ctx.waitUntil(seguro);
  } catch {
    // sem contexto (testes/scripts): segue sozinho
  }
}
