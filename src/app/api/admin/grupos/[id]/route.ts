import { eq, sql } from "drizzle-orm";
import { grupos, usuarioGrupos } from "@/db/schema";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { grupoPatchSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

async function trocarMembros(grupoId: number, membros: number[]) {
  const db = getDb();
  await db.delete(usuarioGrupos).where(eq(usuarioGrupos.grupoId, grupoId));
  for (let i = 0; i < membros.length; i += 40) {
    const lote = membros.slice(i, i + 40);
    await db.insert(usuarioGrupos).values(lote.map((usuarioId) => ({ usuarioId, grupoId })));
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const corpo = await parseCorpo(grupoPatchSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const { nome, permissaoId, membros } = corpo.data;

  const set = {
    ...(nome !== undefined ? { nome } : {}),
    ...(permissaoId !== undefined ? { permissaoId: permissaoId ?? null } : {}),
    atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
  };
  await getDb().update(grupos).set(set).where(eq(grupos.id, id));
  if (membros !== undefined) await trocarMembros(id, membros);
  return ok();
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  // Vínculos e grupo_id de protocolos/opções caem por FK (cascade / set null).
  await getDb().delete(grupos).where(eq(grupos.id, id));
  return ok();
}
