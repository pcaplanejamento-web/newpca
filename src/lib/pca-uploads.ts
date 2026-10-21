import { desc, eq, sql } from "drizzle-orm";
import { pcaUploads, unidades, usuarios } from "@/db/schema";
import { getDb } from "./db";

/** UM upload de planilha no PCA — o componente da aba Importação (a consolidada traz várias unidades num upload só). */
export type UploadPca = {
  id: number;
  nomeArquivo: string | null;
  criadoEm: string | null;
  criadoPor: string | null;
  unidades: string[];
  totalItens: number;
  valorTotal: number;
};

/** Os uploads do PCA, o mais recente primeiro, com as unidades e os totais (UMA consulta). */
export async function uploadsDoPca(pcaId: number): Promise<UploadPca[]> {
  const linhas = await getDb()
    .select({
      id: pcaUploads.id,
      nomeArquivo: pcaUploads.nomeArquivo,
      criadoEm: pcaUploads.criadoEm,
      criadoPor: usuarios.nome,
      unidades: sql<string | null>`GROUP_CONCAT(${unidades.codigo}, '|')`,
      totalItens: sql<number>`COALESCE(SUM(${unidades.totalItens}), 0)`,
      valorTotal: sql<number>`COALESCE(SUM(${unidades.valorTotal}), 0)`,
    })
    .from(pcaUploads)
    .leftJoin(unidades, eq(unidades.uploadId, pcaUploads.id))
    .leftJoin(usuarios, eq(usuarios.id, pcaUploads.criadoPor))
    .where(eq(pcaUploads.pcaId, pcaId))
    .groupBy(pcaUploads.id)
    .orderBy(desc(pcaUploads.id));
  return linhas.map((l) => ({ ...l, unidades: (l.unidades ?? "").split("|").filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR")) }));
}
