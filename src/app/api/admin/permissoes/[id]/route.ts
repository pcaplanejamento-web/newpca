import { eq, sql } from "drizzle-orm";
import { permissoes } from "@/db/schema";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { permissaoSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const corpo = await parseCorpo(permissaoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  await getDb()
    .update(permissoes)
    .set({
      nome: corpo.data.nome,
      abas: JSON.stringify(corpo.data.abas),
      atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(permissoes.id, id));
  return ok();
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  // Grupos que apontavam para esta permissão ficam sem permissão (FK set null).
  await getDb().delete(permissoes).where(eq(permissoes.id, id));
  return ok();
}
