/**
 * Núcleo PURO do LOGIN COM GOOGLE (OAuth 2.0 Authorization Code + PKCE + state) — sem getDb/env → testável. O servidor
 * troca o código DIRETO com o Google (TLS, com o client secret): o `id_token` recebido assim é confiável e basta validar as
 * declarações (emissor, público, validade e e-mail verificado).
 */

export const HOST_AUTORIZACAO_GOOGLE = "https://accounts.google.com/o/oauth2/v2/auth";
export const HOST_TOKEN_GOOGLE = "https://oauth2.googleapis.com/token";
export const DISCOVERY_GOOGLE = "https://accounts.google.com/.well-known/openid-configuration";
export const CAMINHO_CALLBACK_GOOGLE = "/api/auth/google/callback";
/** O cookie curto (10 min) que guarda o state + o verificador do PKCE entre a ida e a volta do Google. */
export const COOKIE_GOOGLE = "pca_google";
export const VALIDADE_COOKIE_GOOGLE_S = 600;
/** Senha de quem se cadastrou pelo Google: fora do formato pbkdf2 → `verificarSenha` sempre falso. */
export const SENHA_INUTILIZAVEL = "google$sem-senha";

/** A URI de redirecionamento (a MESMA cadastrada no Google Cloud Console). */
export function redirectUri(urlSistema: string): string {
  return `${urlSistema.replace(/\/+$/, "")}${CAMINHO_CALLBACK_GOOGLE}`;
}

/** Client ID no formato do Google ("…apps.googleusercontent.com"). */
export function clientIdValido(id: string): boolean {
  return /^[0-9A-Za-z_-]+\.apps\.googleusercontent\.com$/.test(id.trim());
}

/** base64url sem preenchimento (PKCE e state). */
export function base64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Texto aleatório seguro (32 bytes em base64url). */
export function aleatorio(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** O desafio S256 do PKCE: base64url(SHA-256(verificador)). */
export async function desafioPkce(verificador: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador));
  return base64Url(new Uint8Array(h));
}

/** O endereço do Google para escolher a conta e autorizar. */
export function urlAutorizacao(p: { clientId: string; redirectUri: string; state: string; desafio: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: p.state,
    code_challenge: p.desafio,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${HOST_AUTORIZACAO_GOOGLE}?${q.toString()}`;
}

/** O conteúdo do cookie curto: "state.verificador" (os dois em base64url — sem ponto). */
export function valorCookieGoogle(state: string, verificador: string): string {
  return `${state}.${verificador}`;
}
export function lerCookieGoogle(v: string | undefined | null): { state: string; verificador: string } | null {
  const m = /^([A-Za-z0-9_-]{20,})\.([A-Za-z0-9_-]{43,128})$/.exec(v ?? "");
  return m ? { state: m[1], verificador: m[2] } : null;
}

export type IdentidadeGoogle = { sub: string; email: string; nome: string };

function payloadJwt(jwt: string): Record<string, unknown> | null {
  const partes = jwt.split(".");
  if (partes.length !== 3) return null;
  try {
    const b64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const txt = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const j = JSON.parse(txt) as unknown;
    return j && typeof j === "object" ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Lê e VALIDA o `id_token` recebido do endpoint de token do Google: emissor do Google, público = o nosso client ID,
 * dentro da validade (60 s de folga) e e-mail VERIFICADO. `agoraS` = segundos desde a época (injetável nos testes).
 */
export function lerIdToken(jwt: string, clientId: string, agoraS: number): { ok: true; identidade: IdentidadeGoogle } | { ok: false; motivo: string } {
  const p = payloadJwt(jwt);
  if (!p) return { ok: false, motivo: "id_token ilegível" };
  if (p.iss !== "https://accounts.google.com" && p.iss !== "accounts.google.com") return { ok: false, motivo: "emissor inválido" };
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (!aud.includes(clientId)) return { ok: false, motivo: "público inválido" };
  if (typeof p.exp !== "number" || p.exp + 60 < agoraS) return { ok: false, motivo: "token vencido" };
  const email = typeof p.email === "string" ? p.email.trim().toLowerCase() : "";
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) return { ok: false, motivo: "sem e-mail" };
  if (p.email_verified !== true && p.email_verified !== "true") return { ok: false, motivo: "e-mail não verificado" };
  const sub = typeof p.sub === "string" ? p.sub : "";
  if (!sub) return { ok: false, motivo: "sem identificador" };
  const nomeBruto = typeof p.name === "string" ? p.name : "";
  const nome = nomeBruto.replace(/\s+/g, " ").trim().slice(0, 120) || email.slice(0, email.indexOf("@"));
  return { ok: true, identidade: { sub, email, nome } };
}

/** Os códigos de retorno do login com Google (`/login?erro=`) → a mensagem da tela. */
export const MENSAGEM_ERRO_LOGIN: Record<string, string> = {
  google: "Não foi possível entrar com o Google. Tente de novo.",
  "google-desligado": "O login com Google não está ativo.",
  "google-cancelado": "O login com Google foi cancelado.",
  "google-sem-contas": "O primeiro acesso do sistema precisa ser feito pelo cadastro com e-mail e senha.",
  pendente: "Sua conta ainda está pendente de aprovação por um administrador.",
  "pendente-novo": "Conta criada com o Google. O acesso está pendente de aprovação por um administrador.",
  inativo: "Sua conta está inativa. Fale com um administrador.",
};

/** A mensagem de um código de `?erro=` (desconhecido = nada). */
export function mensagemErroLogin(codigo: string | string[] | undefined): string | null {
  const c = Array.isArray(codigo) ? codigo[0] : codigo;
  return c ? (MENSAGEM_ERRO_LOGIN[c] ?? null) : null;
}

/** Compara dois textos em tempo constante (o state). */
export function iguaisTexto(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
