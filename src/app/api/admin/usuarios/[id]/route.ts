import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usuarios } from "@/db/schema";
import { adminUsuarioSchema } from "@/lib/auth-validation";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");

  const corpo = await parseCorpo(adminUsuarioSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const { nome, email, matricula, role, status } = corpo.data;

  // Impede o admin de remover o próprio acesso (evita lockout).
  if (
    id === guard.u.id &&
    ((role && role !== "admin") || (status && status !== "ativo"))
  ) {
    return erro("Você não pode remover o próprio acesso de administrador.");
  }

  const db = getDb();

  // E-mail é único: rejeita se já pertence a outro usuário.
  if (email !== undefined) {
    const [dono] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(and(eq(usuarios.email, email), ne(usuarios.id, id)))
      .limit(1);
    if (dono) return erro("Este e-mail já está em uso.", 409);
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
  return ok();
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  if (id === guard.u.id) return erro("Você não pode excluir a si mesmo.");
  await getDb().delete(usuarios).where(eq(usuarios.id, id));
  return ok();
}
