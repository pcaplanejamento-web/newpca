import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { usuarios } from "@/db/schema";
import { registrarAuditoria } from "@/lib/auditoria";
import { contarUsuarios, criarSessao, definirCookieSessao } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { emailsDosAdmins, enviarEmailDireto } from "@/lib/email";
import { emailCadastroPendente } from "@/lib/email-core";
import { COOKIE_GOOGLE, iguaisTexto, lerCookieGoogle, redirectUri, SENHA_INUTILIZAVEL } from "@/lib/google-oauth-core";
import { googleDaConfig, trocarCodigo } from "@/lib/google-oauth";
import { depoisDaResposta } from "@/lib/segundo-plano";

export const dynamic = "force-dynamic";

/**
 * Volta do Google: confere o state (cookie curto), troca o código pelo id_token e entra. E-mail já cadastrado e ATIVO =
 * sessão; pendente/inativo = o aviso no login; e-mail NOVO = cadastro PENDENTE (os ADMs recebem o e-mail).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origem = url.origin;
  const voltar = (erro: string | null) => NextResponse.redirect(`${origem}${erro ? `/login?erro=${erro}` : "/painel"}`, 303);

  const jar = await cookies();
  const salvo = lerCookieGoogle(jar.get(COOKIE_GOOGLE)?.value);
  jar.delete({ name: COOKIE_GOOGLE, path: "/api/auth/google" });

  if (url.searchParams.get("error")) return voltar("google-cancelado");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  if (!code || !salvo || !iguaisTexto(state, salvo.state)) return voltar("google");

  const cfg = await googleDaConfig();
  if ("erro" in cfg) return voltar("google-desligado");
  const r = await trocarCodigo({ code, verificador: salvo.verificador, redirectUri: redirectUri(origem), ...cfg });
  if (!r.ok) {
    console.error("[google] login recusado:", r.motivo);
    return voltar("google");
  }
  const { email, nome } = r.identidade;

  try {
    const db = getDb();
    const [u] = await db
      .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, status: usuarios.status })
      .from(usuarios)
      .where(eq(usuarios.email, email))
      .limit(1);

    if (u) {
      if (u.status !== "ativo") return voltar(u.status === "pendente" ? "pendente" : "inativo");
      await definirCookieSessao(await criarSessao(u.id));
      await registrarAuditoria({ usuario: { id: u.id, nome: u.nome, email: u.email }, acao: "login", entidade: "usuario", entidadeId: u.id, resumo: `${u.nome} entrou no sistema com o Google` });
      return voltar(null);
    }

    // O 1º usuário do sistema (que vira ADM) nasce pelo cadastro com senha, nunca pelo Google.
    if ((await contarUsuarios()) === 0) return voltar("google-sem-contas");
    const [novo] = await db
      .insert(usuarios)
      .values({ nome, email, senhaHash: SENHA_INUTILIZAVEL, role: "membro", status: "pendente" })
      .returning({ id: usuarios.id });
    await registrarAuditoria({
      usuario: { id: novo.id, nome, email },
      acao: "cadastro",
      entidade: "usuario",
      entidadeId: novo.id,
      resumo: `${nome} criou uma conta com o Google (pendente de aprovação)`,
      depois: { nome, email, role: "membro", status: "pendente" },
    });
    depoisDaResposta(
      emailsDosAdmins().then((admins) => enviarEmailDireto(admins, (ctx) => emailCadastroPendente({ nome, email }, ctx))),
      "email",
    );
    return voltar("pendente-novo");
  } catch (e) {
    console.error("[google] falha ao entrar:", (e as Error).message);
    return voltar("google");
  }
}
