import { getIntegracoes } from "./integracoes";
import { googleConfigurado } from "./integracoes-core";
import { decifrarSegredo } from "./integracoes-segredos";
import { HOST_TOKEN_GOOGLE, type IdentidadeGoogle, lerIdToken } from "./google-oauth-core";

/**
 * O login com Google no SERVIDOR: a configuração com o segredo DECIFRADO e a TROCA do código pelo `id_token` (host FIXO do
 * Google, 10 s, sem seguir redirecionamento). O `fetch` é injetável.
 */
export async function googleDaConfig(): Promise<{ clientId: string; clientSecret: string } | { erro: string }> {
  const integ = await getIntegracoes({ fresco: true });
  if (!googleConfigurado(integ) || !integ.google) return { erro: "O login com Google não está ativo (Administração → Integrações)." };
  const clientSecret = await decifrarSegredo(integ.google.clientSecret);
  if (!clientSecret) return { erro: "Não foi possível ler o client secret do Google — confira a chave mestra (INTEGRACOES_CHAVE) e salve o segredo de novo." };
  return { clientId: integ.google.clientId, clientSecret };
}

export async function trocarCodigo(
  p: { code: string; verificador: string; redirectUri: string; clientId: string; clientSecret: string },
  buscar: (url: string, init?: RequestInit) => Promise<Response> = (u, i) => fetch(u, i),
): Promise<{ ok: true; identidade: IdentidadeGoogle } | { ok: false; motivo: string }> {
  const ctl = new AbortController();
  const tempo = setTimeout(() => ctl.abort(), 10_000);
  try {
    const r = await buscar(HOST_TOKEN_GOOGLE, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        code: p.code,
        client_id: p.clientId,
        client_secret: p.clientSecret,
        redirect_uri: p.redirectUri,
        grant_type: "authorization_code",
        code_verifier: p.verificador,
      }).toString(),
      signal: ctl.signal,
      redirect: "manual",
    });
    const j = (await r.json().catch(() => null)) as { id_token?: unknown; error?: unknown; error_description?: unknown } | null;
    if (!r.ok || typeof j?.id_token !== "string") return { ok: false, motivo: `token ${r.status}: ${String(j?.error_description ?? j?.error ?? "sem id_token")}` };
    return lerIdToken(j.id_token, p.clientId, Math.floor(Date.now() / 1000));
  } catch (e) {
    return { ok: false, motivo: `rede: ${(e as Error).message}` };
  } finally {
    clearTimeout(tempo);
  }
}
