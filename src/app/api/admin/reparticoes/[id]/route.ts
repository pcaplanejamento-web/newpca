import { eq, sql } from "drizzle-orm";
import { reparticoes } from "@/db/schema";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { reparticaoSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const corpo = await parseCorpo(reparticaoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  await getDb()
    .update(reparticoes)
    .set({ codigo: corpo.data.codigo, nome: corpo.data.nome, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(reparticoes.id, id));
  return ok();
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  // Vínculos grupo↔repartição caem por FK cascade.
  await getDb().delete(reparticoes).where(eq(reparticoes.id, id));
  return ok();
}
