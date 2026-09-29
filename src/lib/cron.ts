import { getCloudflareContext } from "@opennextjs/cloudflare";
import { hashToken } from "./trello-sync-core";

/**
 * A chamada veio do CRON do próprio Worker (`worker.ts` → `scheduled`)? O cabeçalho `x-cron-trello` = SHA-256 de
 * `INTEGRACOES_CHAVE:cron` — só o Worker, que conhece a chave mestra, o calcula. Comparação em tempo constante.
 */
export async function cronAutorizado(req: Request): Promise<boolean> {
  let chave: string | undefined;
  try {
    chave = (getCloudflareContext().env as unknown as { INTEGRACOES_CHAVE?: string }).INTEGRACOES_CHAVE;
  } catch {
    chave = undefined;
  }
  const veio = req.headers.get("x-cron-trello") ?? "";
  return !!chave && !!veio && iguais(veio, await hashToken(`${chave}:cron`));
}

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
