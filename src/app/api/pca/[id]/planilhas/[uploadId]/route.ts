import { and, eq } from "drizzle-orm";
import { pcaUploads } from "@/db/schema";
import { exigirAcesso, intId, recusaPca } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { avisarAdmsPca } from "@/lib/avisos-mesa";
import { getDb } from "@/lib/db";
import { erro, ok } from "@/lib/http";
import { getPcaEspaco } from "@/lib/pca-espaco";

export const dynamic = "force-dynamic";

/** Exclui UM upload do PCA (as planilhas e os itens dele caem em cascata). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; uploadId: string }> }) {
  const a = await exigirAcesso("pca", "excluir");
  if ("erro" in a) return a.erro;
  const prm = await ctx.params;
  const pcaId = intId(prm.id);
  const uploadId = intId(prm.uploadId);
  if (!pcaId || !uploadId) return erro("ID inválido.");
  const semPca = await recusaPca(pcaId);
  if (semPca) return semPca;
  const db = getDb();
  const [up] = await db
    .select({ id: pcaUploads.id, nome: pcaUploads.nomeArquivo })
    .from(pcaUploads)
    .where(and(eq(pcaUploads.id, uploadId), eq(pcaUploads.pcaId, pcaId)))
    .limit(1);
  if (!up) return erro("Upload não encontrado neste PCA.", 404);
  await db.delete(pcaUploads).where(eq(pcaUploads.id, up.id));
  await registrarAuditoria({ usuario: a.u, acao: "excluir", entidade: "planilha", entidadeId: up.id, resumo: `Upload "${up.nome ?? up.id}" excluído do PCA #${pcaId}` });
  const pca = await getPcaEspaco(pcaId);
  if (pca) await avisarAdmsPca(a.u, pca, `Planilha excluída: ${up.nome ?? "sem nome"}`, null, "importacao");
  return ok();
}
