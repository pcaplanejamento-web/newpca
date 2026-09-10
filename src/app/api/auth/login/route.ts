import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { usuarios } from "@/db/schema";
import { criarSessao, definirCookieSessao, verificarSenha } from "@/lib/auth";
import { loginSchema } from "@/lib/auth-validation";

export const dynamic = "force-dynamic";

// Hash "isca" para gastar tempo semelhante quando o e-mail não existe
// (dificulta enumeração de usuários por timing).
const HASH_ISCA =
  "pbkdf2$210000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 422 },
    );
  }

  const { email, senha } = parsed.data;

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

    const token = await criarSessao(u.id);
    await definirCookieSessao(token);
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
