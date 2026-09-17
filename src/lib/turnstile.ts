import { interpretarSiteverify, type ResultadoTurnstile, TURNSTILE_SITEVERIFY } from "./cloudflare-core.ts";
import type { Integracoes } from "./integracoes-core.ts";
import { decifrarSegredo } from "./integracoes-segredos.ts";

/**
 * Confere o token do Turnstile no servidor. Chamar SÓ quando `turnstileConfigurado`.
 * Fail-open em erro de infra (segredo indisponível / rede) para não travar o login;
 * reprova em token ausente ou `success:false`.
 */
export async function verificarTurnstile(
  integ: Integracoes,
  token: string | null | undefined,
  ip?: string | null,
): Promise<ResultadoTurnstile> {
  const tokenPresente = typeof token === "string" && token.length > 0;
  if (!tokenPresente) return interpretarSiteverify(null, false);
  const secret = await decifrarSegredo(integ.turnstile.secret);
  if (!secret) return { ok: true }; // sem segredo utilizável → fail-open
  try {
    const body = new URLSearchParams({ secret, response: token as string });
    if (ip) body.set("remoteip", ip);
    const r = await fetch(TURNSTILE_SITEVERIFY, { method: "POST", body });
    return interpretarSiteverify(await r.json(), true);
  } catch {
    return { ok: true }; // erro de rede → fail-open
  }
}

/**
 * Testa o SECRET do Turnstile sem um token real: envia um token fictício e checa o
 * `error-codes`. `invalid-input-secret` ⇒ chave secreta errada; qualquer outro erro (ex.:
 * `invalid-input-response`) ⇒ o secret é válido (só o token de teste é inválido, esperado).
 */
export async function testarTurnstile(integ: Integracoes): Promise<{ ok: boolean; detalhe: string }> {
  const secret = await decifrarSegredo(integ.turnstile.secret);
  if (!secret) return { ok: false, detalhe: "Secret não configurado (ou chave mestra ausente)." };
  try {
    const r = await fetch(TURNSTILE_SITEVERIFY, {
      method: "POST",
      body: new URLSearchParams({ secret, response: "conexao-teste" }),
    });
    const j = (await r.json()) as { "error-codes"?: string[] };
    const codes = j["error-codes"] ?? [];
    if (codes.includes("invalid-input-secret") || codes.includes("missing-input-secret")) {
      return { ok: false, detalhe: "Secret inválido — confira a chave secreta do widget." };
    }
    return { ok: true, detalhe: "Secret válido. Ative e teste o widget na tela de login." };
  } catch (e) {
    return { ok: false, detalhe: e instanceof Error ? e.message : "Falha ao contatar o Cloudflare." };
  }
}
