import { and, eq } from "drizzle-orm";
import { unidades } from "@/db/schema";
import { exigirAcesso, intId, recusaPca } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Exclui UMA planilha do PCA (os itens caem em cascata). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; unidadeId: string }> }) {
  const a = await exigirAcesso("pca", "excluir");
  if ("erro" in a) return a.erro;
  const prm = await ctx.params;
  const pcaId = intId(prm.id);
  const unidadeId = intId(prm.unidadeId);
  if (!pcaId || !unidadeId) return erro("ID inválido.");
  const semPca = await recusaPca(pcaId);
  if (semPca) return semPca;
  const db = getDb();
  const [u] = await db
    .select({ id: unidades.id, codigo: unidades.codigo })
    .from(unidades)
    .where(and(eq(unidades.id, unidadeId), eq(unidades.pcaId, pcaId)))
    .limit(1);
  if (!u) return erro("Planilha não encontrada neste PCA.", 404);
  await db.delete(unidades).where(eq(unidades.id, u.id));
  await registrarAuditoria({ usuario: a.u, acao: "excluir", entidade: "planilha", entidadeId: u.id, resumo: `Planilha ${u.codigo} excluída do PCA #${pcaId}` });
  return ok();
}
