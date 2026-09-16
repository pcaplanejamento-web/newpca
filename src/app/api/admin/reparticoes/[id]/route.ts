import { eq, sql } from "drizzle-orm";
import { reparticoes } from "@/db/schema";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { reparticaoSchema } from "@/lib/rbac-validation";
import { serializeResponsaveis } from "@/lib/reparticao-responsaveis";

export const dynamic = "force-dynamic";

const CODIGO_GERAL = "GERAL";

/** Recusa mexer na unidade VIRTUAL "Geral" (não é editável nem excluível). */
async function ehGeral(id: number): Promise<boolean> {
  const [r] = await getDb().select({ codigo: reparticoes.codigo }).from(reparticoes).where(eq(reparticoes.id, id)).limit(1);
  return (r?.codigo ?? "").toUpperCase() === CODIGO_GERAL;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  if (await ehGeral(id)) return erro("A unidade 'Geral' é virtual e não pode ser editada.", 400);
  const corpo = await parseCorpo(reparticaoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  await getDb()
    .update(reparticoes)
    .set({
      codigo: corpo.data.codigo,
      nome: corpo.data.nome,
      numeroInteressado: corpo.data.numeroInteressado ?? null,
      setorRequisitante: corpo.data.setorRequisitante ?? null,
      orgaoId: corpo.data.orgaoId ?? null,
      responsavelDfd: serializeResponsaveis(corpo.data.responsaveis),
      atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(reparticoes.id, id));
  return ok();
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  if (await ehGeral(id)) return erro("A unidade 'Geral' é virtual e não pode ser excluída.", 400);
  // Vínculos grupo↔unidade caem por FK cascade.
  await getDb().delete(reparticoes).where(eq(reparticoes.id, id));
  return ok();
}
