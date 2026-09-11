import { and, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { usuarios } from "@/db/schema";
import { getUsuarioAtual } from "@/lib/auth";
import { adminUsuarioSchema } from "@/lib/auth-validation";

export const dynamic = "force-dynamic";

async function exigirAdmin() {
  const atual = await getUsuarioAtual();
  if (!atual || atual.role !== "admin") return null;
  return atual;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const atual = await exigirAdmin();
  if (!atual) {
    return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
  }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
  }

  const parsed = adminUsuarioSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 422 },
    );
  }
  const { nome, email, matricula, role, status } = parsed.data;

  // Impede o admin de remover o próprio acesso (evita lockout).
  if (
    id === atual.id &&
    ((role && role !== "admin") || (status && status !== "ativo"))
  ) {
    return NextResponse.json(
      { ok: false, error: "Você não pode remover o próprio acesso de administrador." },
      { status: 400 },
    );
  }

  const db = getDb();

  // E-mail é único: rejeita se já pertence a outro usuário.
  if (email !== undefined) {
    const [dono] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(and(eq(usuarios.email, email), ne(usuarios.id, id)))
      .limit(1);
    if (dono)
      return NextResponse.json(
        { ok: false, error: "Este e-mail já está em uso." },
        { status: 409 },
      );
  }

  const set = {
    ...(nome !== undefined ? { nome } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(matricula !== undefined ? { matricula: matricula ? matricula : null } : {}),
    ...(role !== undefined ? { role } : {}),
    ...(status !== undefined ? { status } : {}),
    atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
  };
  await db.update(usuarios).set(set).where(eq(usuarios.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const atual = await exigirAdmin();
  if (!atual) {
    return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
  }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
  }
  if (id === atual.id) {
    return NextResponse.json(
      { ok: false, error: "Você não pode excluir a si mesmo." },
      { status: 400 },
    );
  }
  await getDb().delete(usuarios).where(eq(usuarios.id, id));
  return NextResponse.json({ ok: true });
}
