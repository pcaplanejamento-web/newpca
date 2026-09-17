import { getCloudflareContext } from "@opennextjs/cloudflare";
import { chaveDeSegredo, cifrar, decifrar } from "./cripto.ts";

/**
 * Wrapper SERVER-ONLY: lê a chave mestra (Worker Secret `INTEGRACOES_CHAVE`) do
 * ambiente e cifra/decifra os segredos das integrações. Sem a chave, degrada
 * graciosamente (nada quebra: os segredos ficam "não configurados"). A cifra pura
 * (testável) está em `cripto.ts`.
 */

function chaveMestraRaw(): string | null {
  try {
    // A chave é um Worker Secret (não vai em wrangler.jsonc) — acesso defensivo tipado.
    const env = getCloudflareContext().env as unknown as { INTEGRACOES_CHAVE?: string };
    const v = env.INTEGRACOES_CHAVE;
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function temChaveMestra(): boolean {
  return chaveMestraRaw() != null;
}

/** Cifra um segredo em texto puro. Lança se a chave mestra não estiver definida. */
export async function cifrarSegredo(texto: string): Promise<string> {
  const mestra = chaveMestraRaw();
  if (!mestra) throw new Error("Chave mestra (INTEGRACOES_CHAVE) não definida no Cloudflare.");
  return cifrar(await chaveDeSegredo(mestra), texto);
}

/** Decifra um segredo. `null` se não houver chave mestra ou o blob for inválido. */
export async function decifrarSegredo(blob: string): Promise<string | null> {
  const mestra = chaveMestraRaw();
  if (!mestra || !blob) return null;
  return decifrar(await chaveDeSegredo(mestra), blob);
}
