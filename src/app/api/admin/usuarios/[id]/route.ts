import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { usuarios } from "@/db/schema";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ROLES = ["admin", "gestor", "membro"] as const;
const STATUS = ["ativo", "pendente", "inativo"] as const;
type Role = (typeof ROLES)[number];
type Status = (typeof STATUS)[number];

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

  let body: { role?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const set: { role?: Role; status?: Status; atualizadoEm: ReturnType<typeof sql> } = {
    atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
  };
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role as Role))
      return NextResponse.json({ ok: false, error: "Papel inválido." }, { status: 422 });
    set.role = body.role as Role;
  }
  if (body.status !== undefined) {
    if (!STATUS.includes(body.status as Status))
      return NextResponse.json({ ok: false, error: "Status inválido." }, { status: 422 });
    set.status = body.status as Status;
  }

  // Impede o admin de remover o próprio acesso (evita lockout).
  if (
    id === atual.id &&
    ((set.role && set.role !== "admin") || (set.status && set.status !== "ativo"))
  ) {
    return NextResponse.json(
      { ok: false, error: "Você não pode remover o próprio acesso de administrador." },
      { status: 400 },
    );
  }

  await getDb().update(usuarios).set(set).where(eq(usuarios.id, id));
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
