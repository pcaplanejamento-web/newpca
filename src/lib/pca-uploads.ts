import { desc, eq, sql } from "drizzle-orm";
import { itens, pcaUploads, unidades, usuarios } from "@/db/schema";
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

/** UM item importado por planilha no PCA — a visão ITENS da Importação. */
export type ItemUpload = {
  id: number;
  uploadId: number | null;
  arquivo: string | null;
  unidade: string;
  sequencial: number | null;
  codigo: string | null;
  produto: string | null;
  unidadeMedida: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
  classificacao: string | null;
};

/** Os itens das planilhas do PCA, do sequencial maior ao menor (os recém-adicionados primeiro). */
export async function itensDosUploads(pcaId: number): Promise<ItemUpload[]> {
  return getDb()
    .select({
      id: itens.id,
      uploadId: unidades.uploadId,
      arquivo: pcaUploads.nomeArquivo,
      unidade: unidades.codigo,
      sequencial: itens.sequencial,
      codigo: itens.idProduto,
      produto: itens.nomeProduto,
      unidadeMedida: itens.unidadeMedida,
      quantidade: itens.quantidade,
      valorUnitario: itens.valorReferencia,
      valorTotal: itens.valorTotal,
      classificacao: itens.classificacao,
    })
    .from(itens)
    .innerJoin(unidades, eq(unidades.id, itens.unidadeId))
    .leftJoin(pcaUploads, eq(pcaUploads.id, unidades.uploadId))
    .where(eq(unidades.pcaId, pcaId))
    .orderBy(desc(itens.sequencial));
}
