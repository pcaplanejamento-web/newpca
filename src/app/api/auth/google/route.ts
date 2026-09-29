import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth";
import {
  aleatorio,
  COOKIE_GOOGLE,
  COOKIE_GOOGLE_CONTA,
  desafioPkce,
  lerContaLembrada,
  redirectUri,
  urlAutorizacao,
  VALIDADE_COOKIE_GOOGLE_S,
  valorCookieGoogle,
} from "@/lib/google-oauth-core";
import { googleDaConfig } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

/**
 * Início do login com Google: gera o state + o PKCE, guarda num cookie curto e leva ao Google.
 * - `?vincular=1` (Perfil, logado): a volta VINCULA a conta Google ao usuário.
 * - `?trocar=1`: escolher outra conta (sem a lembrada).
 * - sem nada: com a conta LEMBRADA neste aparelho, o Google entra direto nela.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origem = url.origin;
  const vincular = url.searchParams.get("vincular") === "1";
  if (vincular && !(await getUsuarioAtual())) return NextResponse.redirect(`${origem}/login`, 303);
  const cfg = await googleDaConfig();
  if ("erro" in cfg) return NextResponse.redirect(vincular ? `${origem}/painel/perfil?google=erro` : `${origem}/login?erro=google-desligado`, 303);

  const dica = vincular || url.searchParams.get("trocar") === "1" ? null : lerContaLembrada((await cookies()).get(COOKIE_GOOGLE_CONTA)?.value);
  const state = aleatorio();
  const verificador = aleatorio();
  const res = NextResponse.redirect(
    urlAutorizacao({ clientId: cfg.clientId, redirectUri: redirectUri(origem), state, desafio: await desafioPkce(verificador), dica }),
    303,
  );
  res.cookies.set(COOKIE_GOOGLE, valorCookieGoogle(state, verificador, vincular ? "vincular" : "entrar"), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: VALIDADE_COOKIE_GOOGLE_S,
  });
  return res;
}
