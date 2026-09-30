import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { usuarios } from "@/db/schema";
import { registrarAuditoria } from "@/lib/auditoria";
import { criarSessao, definirCookieSessao, getUsuarioAtual } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  COOKIE_GOOGLE,
  COOKIE_GOOGLE_CONTA,
  type CandidatoGoogle,
  decidirLoginGoogle,
  iguaisTexto,
  lerCookieGoogle,
  podeVincular,
  redirectUri,
  VALIDADE_COOKIE_CONTA_S,
} from "@/lib/google-oauth-core";
import { googleDaConfig, trocarCodigo } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

const COLS = { id: usuarios.id, nome: usuarios.nome, email: usuarios.email, status: usuarios.status, googleSub: usuarios.googleSub };

/**
 * Volta do Google: confere o state (cookie curto), troca o código pelo id_token e — conforme o modo — ENTRA ou VINCULA.
 * Entrar: a conta Google vinculada (pelo `sub`, mesmo com outro e-mail) → senão o MESMO e-mail (e vincula) → senão leva ao
 * CADASTRO institucional (a conta nova nunca nasce pelo Google). A conta que entrou fica LEMBRADA neste aparelho ("Continuar como …").
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origem = url.origin;
  const jar = await cookies();
  const salvo = lerCookieGoogle(jar.get(COOKIE_GOOGLE)?.value);
  const vincular = salvo?.modo === "vincular";
  const ir = (caminho: string, conta?: string) => {
    const res = NextResponse.redirect(`${origem}${caminho}`, 303);
    res.cookies.set(COOKIE_GOOGLE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/auth/google", maxAge: 0 });
    if (conta) res.cookies.set(COOKIE_GOOGLE_CONTA, conta, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: VALIDADE_COOKIE_CONTA_S });
    return res;
  };
  // A falha volta com o código e, quando houver, o motivo do Google (invalid_client, redirect_uri_mismatch…) — a tela explica.
  const falhou = (codigo: string, motivo = "") => {
    const m = motivo ? `&motivo=${encodeURIComponent(motivo)}` : "";
    return ir(vincular ? `/painel/perfil?google=${codigo}${m}` : `/login?erro=${codigo}${m}`);
  };

  if (url.searchParams.get("error")) return vincular ? ir("/painel/perfil") : ir("/login?erro=google-cancelado");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  if (!code || !salvo || !iguaisTexto(state, salvo.state)) return falhou("google-estado");

  const cfg = await googleDaConfig();
  if ("erro" in cfg) return falhou("google-desligado");
  const r = await trocarCodigo({ code, verificador: salvo.verificador, redirectUri: redirectUri(origem), ...cfg });
  if (!r.ok) {
    console.error("[google] troca recusada:", r.motivo);
    return falhou("google-token", r.codigo);
  }
  const { sub, email } = r.identidade;

  try {
    const db = getDb();
    const [porSub] = await db.select(COLS).from(usuarios).where(eq(usuarios.googleSub, sub)).limit(1);

    // VINCULAR a conta Google ao usuário logado (Perfil).
    if (vincular) {
      const u = await getUsuarioAtual();
      if (!u) return ir("/login");
      if (!podeVincular(u.id, porSub ?? null)) return ir("/painel/perfil?google=em-uso");
      await db.update(usuarios).set({ googleSub: sub, googleEmail: email }).where(eq(usuarios.id, u.id));
      await registrarAuditoria({ usuario: u, acao: "editar", entidade: "usuario", entidadeId: u.id, resumo: `${u.nome} vinculou a conta Google ${email}` });
      return ir("/painel/perfil?google=vinculado", email);
    }

    const [porEmail] = porSub ? [] : await db.select(COLS).from(usuarios).where(eq(usuarios.email, email)).limit(1);
    const cand = (x: typeof porSub | undefined): CandidatoGoogle | null => (x ? { id: x.id, googleSub: x.googleSub } : null);
    const decisao = decidirLoginGoogle(sub, cand(porSub), cand(porEmail));
    if (decisao.tipo === "outra-conta") return ir("/login?erro=google-outra-conta");

    if (decisao.tipo === "entrar") {
      const u = (porSub ?? porEmail) as NonNullable<typeof porSub>;
      if (decisao.vincular) await db.update(usuarios).set({ googleSub: sub, googleEmail: email }).where(eq(usuarios.id, u.id));
      if (u.status !== "ativo") return ir(`/login?erro=${u.status === "pendente" ? "pendente" : "inativo"}`, email);
      await definirCookieSessao(await criarSessao(u.id));
      await registrarAuditoria({ usuario: { id: u.id, nome: u.nome, email: u.email }, acao: "login", entidade: "usuario", entidadeId: u.id, resumo: `${u.nome} entrou no sistema com o Google (${email})` });
      return ir("/painel", email);
    }

    // Conta NOVA só pelo cadastro institucional (unidade, matrícula, e-mail confirmado e senha) — o Google se vincula
    // depois, no Perfil.
    return ir("/cadastro?erro=google-sem-cadastro");
  } catch (e) {
    console.error("[google] falha:", (e as Error).message);
    return falhou("google", "interno");
  }
}
