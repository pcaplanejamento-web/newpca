/**
 * Núcleo PURO do LOGIN COM GOOGLE (OAuth 2.0 Authorization Code + PKCE + state) — sem getDb/env → testável. O servidor
 * troca o código DIRETO com o Google (TLS, com o client secret): o `id_token` recebido assim é confiável e basta validar as
 * declarações (emissor, público, validade e e-mail verificado).
 */

export const HOST_AUTORIZACAO_GOOGLE = "https://accounts.google.com/o/oauth2/v2/auth";
export const HOST_TOKEN_GOOGLE = "https://oauth2.googleapis.com/token";
export const CAMINHO_CALLBACK_GOOGLE = "/api/auth/google/callback";
/** O cookie curto (10 min) que guarda o state + o verificador do PKCE entre a ida e a volta do Google. */
export const COOKIE_GOOGLE = "pca_google";
export const VALIDADE_COOKIE_GOOGLE_S = 600;
/** O cookie LONGO (1 ano) que lembra, NESTE aparelho, a conta Google que entrou por último — o login oferece
 *  "Continuar como …" e o Google entra direto nela (`login_hint`), sem a tela de escolher a conta. */
export const COOKIE_GOOGLE_CONTA = "pca_google_conta";
export const VALIDADE_COOKIE_CONTA_S = 365 * 86_400;
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

/**
 * O endereço do Google para autorizar. Com a conta LEMBRADA (`dica` = o e-mail), vai direto nela (`login_hint`, sem a tela
 * de escolher); sem ela — ou ao pedir outra conta —, a tela de escolher a conta (`select_account`).
 */
export function urlAutorizacao(p: { clientId: string; redirectUri: string; state: string; desafio: string; dica?: string | null }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: p.state,
    code_challenge: p.desafio,
    code_challenge_method: "S256",
  });
  if (p.dica) q.set("login_hint", p.dica);
  else q.set("prompt", "select_account");
  return `${HOST_AUTORIZACAO_GOOGLE}?${q.toString()}`;
}

/** O que a ida ao Google vai fazer na volta: ENTRAR ou VINCULAR a conta Google ao usuário logado. */
export type ModoGoogle = "entrar" | "vincular";

/** O conteúdo do cookie curto: "state.verificador.modo" (base64url — sem ponto; modo e = entrar, v = vincular). */
export function valorCookieGoogle(state: string, verificador: string, modo: ModoGoogle = "entrar"): string {
  return `${state}.${verificador}.${modo === "vincular" ? "v" : "e"}`;
}
export function lerCookieGoogle(v: string | undefined | null): { state: string; verificador: string; modo: ModoGoogle } | null {
  const m = /^([A-Za-z0-9_-]{20,})\.([A-Za-z0-9_-]{43,128})(?:\.([ev]))?$/.exec(v ?? "");
  return m ? { state: m[1], verificador: m[2], modo: m[3] === "v" ? "vincular" : "entrar" } : null;
}

/** O e-mail lembrado no cookie da conta (só um e-mail válido; qualquer outra coisa = nada). */
export function lerContaLembrada(v: string | undefined | null): string | null {
  const e = (v ?? "").trim().toLowerCase();
  return e.length <= 160 && /^[^@\s<>"]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(e) ? e : null;
}

/** Um usuário candidato no banco (pela conta Google vinculada ou pelo e-mail). */
export type CandidatoGoogle = { id: number; googleSub: string | null };

/**
 * QUEM entra com esta conta Google (regra única, testada):
 * 1. a conta Google VINCULADA a um usuário (pelo identificador `sub` — vale mesmo com outro e-mail);
 * 2. senão, o usuário do MESMO e-mail sem outra conta Google vinculada (e a conta passa a ficar vinculada);
 * 3. o mesmo e-mail já vinculado a OUTRA conta Google → recusa (`outra-conta`);
 * 4. ninguém → `novo` (a pessoa faz o cadastro institucional e vincula o Google no Perfil).
 */
export function decidirLoginGoogle(
  sub: string,
  porSub: CandidatoGoogle | null,
  porEmail: CandidatoGoogle | null,
): { tipo: "entrar"; id: number; vincular: boolean } | { tipo: "outra-conta" } | { tipo: "novo" } {
  if (porSub) return { tipo: "entrar", id: porSub.id, vincular: false };
  if (porEmail) return porEmail.googleSub && porEmail.googleSub !== sub ? { tipo: "outra-conta" } : { tipo: "entrar", id: porEmail.id, vincular: !porEmail.googleSub };
  return { tipo: "novo" };
}

/** Vincular a conta Google ao usuário logado: recusa a conta que já é de OUTRO usuário. */
export function podeVincular(usuarioId: number, porSub: CandidatoGoogle | null): boolean {
  return !porSub || porSub.id === usuarioId;
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
  "google-estado": "O login com o Google expirou ou foi aberto em outra aba. Tente de novo.",
  "google-token":
    "O Google recusou a autorização. Confira em Integrações o Client ID e o Client secret e, no Google Cloud, a URI de redirecionamento deste endereço.",
  "google-outra-conta": "Este e-mail já está vinculado a OUTRA conta Google. Entre com a conta vinculada ou com e-mail e senha.",
  "google-desligado": "O login com Google não está ativo.",
  "google-cancelado": "O login com Google foi cancelado.",
  "google-sem-cadastro":
    "Nenhuma conta usa este Google. Crie sua conta com o e-mail institucional; depois de aprovada, vincule o Google no Perfil para entrar com um clique.",
  pendente: "Sua conta ainda está pendente de aprovação por um administrador.",
  inativo: "Sua conta está inativa. Fale com um administrador.",
};

/** Os retornos do VÍNCULO no Perfil (`/painel/perfil?google=`): sucesso ou o motivo (as falhas usam os MESMOS códigos do login). */
export const MENSAGEM_VINCULO: Record<string, { ok: boolean; texto: string }> = {
  vinculado: { ok: true, texto: "Conta Google vinculada. Agora você entra com um clique em “Continuar com Google”." },
  "em-uso": { ok: false, texto: "Esta conta Google já está vinculada a outro usuário do sistema." },
  erro: { ok: false, texto: "Não foi possível vincular a conta Google. Tente de novo." },
  google: { ok: false, texto: "Não foi possível vincular a conta Google (falha interna). Tente de novo." },
  "google-estado": { ok: false, texto: "O vínculo com o Google expirou ou foi aberto em outra aba. Tente de novo." },
  "google-desligado": { ok: false, texto: "O login com Google não está ativo, ou o Client secret não pôde ser lido (salve-o de novo em Integrações)." },
  "google-token": { ok: false, texto: "O Google recusou a autorização." },
};

/** O código de erro que o Google devolve (`invalid_client`…) — só letras e "_", para ir na URL com segurança. */
export function codigoErroGoogle(v: unknown): string {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return /^[a-z_]{1,40}$/.test(s) ? s : "";
}

/** O que fazer para cada código de erro do Google (o `motivo` da volta). */
export const DETALHE_ERRO_GOOGLE: Record<string, string> = {
  invalid_client: "O Client ID ou o Client secret estão incorretos — confira em Integrações → Login com Google (copie de novo do Google Cloud).",
  unauthorized_client: "O Client ID não é do tipo “Aplicativo da Web” ou não está autorizado para este fluxo.",
  redirect_uri_mismatch: "A URI de redirecionamento deste endereço não está cadastrada no cliente OAuth do Google Cloud.",
  invalid_grant: "O código do Google expirou ou já foi usado — tente de novo.",
  interno: "Falha ao gravar no sistema.",
};

/** A mensagem completa de uma falha: o texto do código + o detalhe do motivo do Google, quando houver. */
export function mensagemFalhaGoogle(base: string, motivo: string | string[] | undefined): string {
  const m = codigoErroGoogle(Array.isArray(motivo) ? motivo[0] : motivo);
  const detalhe = m ? (DETALHE_ERRO_GOOGLE[m] ?? `Resposta do Google: ${m}.`) : "";
  return detalhe ? `${base} ${detalhe}` : base;
}

/** A mensagem de um código de `?erro=` (desconhecido = nada), com o detalhe do `motivo` do Google quando houver. */
export function mensagemErroLogin(codigo: string | string[] | undefined, motivo?: string | string[]): string | null {
  const c = Array.isArray(codigo) ? codigo[0] : codigo;
  const base = c ? MENSAGEM_ERRO_LOGIN[c] : undefined;
  return base ? mensagemFalhaGoogle(base, motivo) : null;
}

/** O retorno do vínculo (`?google=` + `&motivo=`) → a mensagem do Perfil (desconhecido = nada). */
export function mensagemVinculo(codigo: string | string[] | undefined, motivo?: string | string[]): { ok: boolean; texto: string } | null {
  const c = Array.isArray(codigo) ? codigo[0] : codigo;
  const m = c ? MENSAGEM_VINCULO[c] : undefined;
  return m ? { ok: m.ok, texto: m.ok ? m.texto : mensagemFalhaGoogle(m.texto, motivo) } : null;
}

/** Compara dois textos em tempo constante (o state). */
export function iguaisTexto(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
