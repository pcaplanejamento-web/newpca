import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { usuarios } from "@/db/schema";
import { registrarAuditoria } from "@/lib/auditoria";
import { criarSessao, definirCookieSessao, verificarSenha } from "@/lib/auth";
import { loginSchema } from "@/lib/auth-validation";
import { erro, parseCorpo } from "@/lib/http";
import { contarTentativa, esperaDe, ipDe, respostaLimite, verificarCaptcha, zerarTentativas } from "@/lib/seguranca-acesso";

export const dynamic = "force-dynamic";

// Hash "isca" para gastar tempo semelhante quando o e-mail não existe
// (dificulta enumeração de usuários por timing).
const HASH_ISCA =
  "pbkdf2$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";

export async function POST(req: Request) {
  const corpo = await parseCorpo(loginSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const { email, senha, token: captchaToken } = corpo.data;

  // LIMITE DE TENTATIVAS: por IP (toda tentativa) e por CONTA (as senhas erradas — protege de força bruta distribuída).
  const esperaIp = await contarTentativa("loginIp", ipDe(req));
  if (esperaIp) return respostaLimite(esperaIp);
  const esperaConta = await esperaDe("loginEmail", email);
  if (esperaConta) return respostaLimite(esperaConta);

  // CAPTCHA sempre exigido (o Turnstile do ADM ou a verificação anti-robô própria).
  const cap = await verificarCaptcha(req, captchaToken);
  if (!cap.ok) return erro(cap.motivo, 400);

  try {
    const [u] = await getDb()
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        role: usuarios.role,
        status: usuarios.status,
        senhaHash: usuarios.senhaHash,
      })
      .from(usuarios)
      .where(eq(usuarios.email, email))
      .limit(1);

    const ok = await verificarSenha(senha, u?.senhaHash ?? HASH_ISCA);
    if (!u || !ok) {
      await contarTentativa("loginEmail", email);
      return NextResponse.json(
        { ok: false, error: "E-mail ou senha incorretos." },
        { status: 401 },
      );
    }

    if (u.status !== "ativo") {
      return NextResponse.json(
        {
          ok: false,
          error:
            u.status === "pendente"
              ? "Sua conta ainda está pendente de aprovação por um administrador."
              : "Sua conta está inativa. Fale com um administrador.",
        },
        { status: 403 },
      );
    }

    await zerarTentativas("loginEmail", email);
    const token = await criarSessao(u.id);
    await definirCookieSessao(token);
    await registrarAuditoria({ usuario: { id: u.id, nome: u.nome, email: u.email }, acao: "login", entidade: "usuario", entidadeId: u.id, resumo: `${u.nome} entrou no sistema` });
    return NextResponse.json({
      ok: true,
      usuario: { nome: u.nome, email: u.email, role: u.role },
    });
  } catch (err) {
    console.error("Falha no login:", err);
    return NextResponse.json(
      { ok: false, error: "Erro ao entrar. Tente novamente." },
      { status: 500 },
    );
  }
}
