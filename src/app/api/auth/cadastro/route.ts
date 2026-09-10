import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { usuarios } from "@/db/schema";
import {
  contarUsuarios,
  criarSessao,
  definirCookieSessao,
  hashSenha,
} from "@/lib/auth";
import { cadastroSchema } from "@/lib/auth-validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const parsed = cadastroSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 422 },
    );
  }

  const { nome, email, senha } = parsed.data;
  const db = getDb();

  try {
    const [existe] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.email, email))
      .limit(1);
    if (existe) {
      return NextResponse.json(
        { ok: false, error: "Este e-mail já está cadastrado." },
        { status: 409 },
      );
    }

    // Primeiro usuário do sistema vira admin ativo; os demais entram pendentes.
    const primeiro = (await contarUsuarios()) === 0;
    const senhaHash = await hashSenha(senha);

    const [u] = await db
      .insert(usuarios)
      .values({
        nome,
        email,
        senhaHash,
        role: primeiro ? "admin" : "membro",
        status: primeiro ? "ativo" : "pendente",
      })
      .returning({ id: usuarios.id, role: usuarios.role, status: usuarios.status });

    if (u.status === "ativo") {
      const token = await criarSessao(u.id);
      await definirCookieSessao(token);
      return NextResponse.json({
        ok: true,
        autenticado: true,
        usuario: { nome, email, role: u.role },
      });
    }

    // Pendente de aprovação por um admin.
    return NextResponse.json({ ok: true, autenticado: false, pendente: true });
  } catch (err) {
    console.error("Falha no cadastro:", err);
    return NextResponse.json(
      { ok: false, error: "Erro ao criar a conta. Tente novamente." },
      { status: 500 },
    );
  }
}
