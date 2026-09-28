import { getCloudflareContext } from "@opennextjs/cloudflare";
import { erro, ok } from "@/lib/http";
import { processarFila, reconciliarQuadros } from "@/lib/trello-processar";
import { hashToken } from "@/lib/trello-sync-core";

export const dynamic = "force-dynamic";

/**
 * O CRON da sincronização com o Trello (a cada 5 min, pelo `scheduled` do `worker.ts` — nunca pela internet): reconcilia
 * os quadros ligados (o que um aviso perdido deixou para trás entra na fila) e processa a fila. Autenticado pelo cabeçalho
 * `x-cron-trello` = SHA-256 de `INTEGRACOES_CHAVE:cron` (só o próprio Worker o calcula).
 */
export async function POST(req: Request) {
  let chave: string | undefined;
  try {
    chave = (getCloudflareContext().env as unknown as { INTEGRACOES_CHAVE?: string }).INTEGRACOES_CHAVE;
  } catch {
    chave = undefined;
  }
  const veio = req.headers.get("x-cron-trello") ?? "";
  if (!chave || !veio || !iguais(veio, await hashToken(`${chave}:cron`))) return erro("Não autorizado.", 401);
  const postos = await reconciliarQuadros(10);
  const r = await processarFila(10);
  return ok({ postos, ...r });
}

/** Comparação em tempo constante. */
function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
