import { NextResponse } from "next/server";
import { aleatorio, COOKIE_GOOGLE, desafioPkce, redirectUri, urlAutorizacao, VALIDADE_COOKIE_GOOGLE_S, valorCookieGoogle } from "@/lib/google-oauth-core";
import { googleDaConfig } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

/** Início do login com Google: gera o state + o PKCE, guarda num cookie curto e leva à escolha da conta no Google. */
export async function GET(req: Request) {
  const origem = new URL(req.url).origin;
  const cfg = await googleDaConfig();
  if ("erro" in cfg) return NextResponse.redirect(`${origem}/login?erro=google-desligado`, 303);
  const state = aleatorio();
  const verificador = aleatorio();
  const res = NextResponse.redirect(
    urlAutorizacao({ clientId: cfg.clientId, redirectUri: redirectUri(origem), state, desafio: await desafioPkce(verificador) }),
    303,
  );
  res.cookies.set(COOKIE_GOOGLE, valorCookieGoogle(state, verificador), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: VALIDADE_COOKIE_GOOGLE_S,
  });
  return res;
}
