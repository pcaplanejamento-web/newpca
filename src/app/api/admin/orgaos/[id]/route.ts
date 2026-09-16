import { eq, sql } from "drizzle-orm";
import { orgaos } from "@/db/schema";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { orgaoSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const corpo = await parseCorpo(orgaoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  await getDb()
    .update(orgaos)
    .set({
      sigla: corpo.data.sigla,
      nome: corpo.data.nome,
      orgaoEntidade: corpo.data.orgaoEntidade ?? null,
      atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(orgaos.id, id));
  return ok();
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  // As unidades do órgão ficam sem vínculo (FK ON DELETE SET NULL) — nada é apagado.
  await getDb().delete(orgaos).where(eq(orgaos.id, id));
  return ok();
}
