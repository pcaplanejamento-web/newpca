import { and, desc, eq, sql } from "drizzle-orm";
import { itens, pcaUploads, subunidades, unidades, usuarios } from "@/db/schema";
import { getDb } from "./db";
import { linhasParaTexto } from "./itens-dash-texto";
import { memoPorVersao } from "./versao-dados";

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
  dominio: string | null;
  /** O nome da unidade da planilha (o LOCAL). */
  municipio: string | null;
  /** A previsão: a data desejada (ISO) ou o período genérico (ANUAL…). */
  dataDesejada: string | null;
  previsaoGenerica: string | null;
  prioridade: string | null;
  /** CANCELADO no PCA (`0180`): quando e por quem — `null` = ativo. */
  canceladoEm: string | null;
  canceladoPorNome: string | null;
  /** A UNIDADE do sistema da planilha (`unidades.reparticao_id`) e a SUBUNIDADE escolhida (`0181`) — só a dessa unidade. */
  reparticaoId: number | null;
  subunidadeId: number | null;
  subunidade: string | null;
};

/** Os itens das planilhas do PCA (ATIVOS e CANCELADOS — a coluna Situação no PCA os distingue), do sequencial maior ao
 * menor (os recém-adicionados primeiro). */
/** A ordem fixa dos campos no texto compacto da aba Importação. */
export const CAMPOS_ITEM_UPLOAD = [
  "id", "uploadId", "arquivo", "unidade", "sequencial", "codigo", "produto", "unidadeMedida", "quantidade", "valorUnitario",
  "valorTotal", "classificacao", "dominio", "municipio", "dataDesejada", "previsaoGenerica", "prioridade", "canceladoEm",
  "canceladoPorNome", "reparticaoId", "subunidadeId", "subunidade",
] as const satisfies readonly (keyof ItemUpload)[];

/** Os itens das planilhas do PCA como UM texto compacto + as unidades do sistema delas — MEMORIZADO pela versão dos dados
 * (milhares de itens: o React não serializa valor a valor e a consulta roda uma vez por versão — o limite do Worker). */
export function itensDosUploadsTexto(pcaId: number): Promise<{ texto: string; total: number; reparticoes: number[] }> {
  return memoPorVersao(`pca-importacao:${pcaId}`, async () => {
    const l = await itensDosUploads(pcaId);
    return {
      texto: linhasParaTexto(l, CAMPOS_ITEM_UPLOAD),
      total: l.length,
      reparticoes: [...new Set(l.map((i) => i.reparticaoId).filter((x): x is number => x != null))],
    };
  });
}

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
      classificacao: sql<string | null>`COALESCE(${itens.classificacaoCat}, ${itens.classificacao})`,
      dominio: sql<string | null>`COALESCE(${itens.dominioCat}, ${itens.dominio})`,
      municipio: unidades.municipio,
      dataDesejada: itens.dataDesejada,
      previsaoGenerica: itens.previsaoGenerica,
      prioridade: itens.prioridade,
      canceladoEm: itens.canceladoEm,
      canceladoPorNome: itens.canceladoPorNome,
      reparticaoId: unidades.reparticaoId,
      subunidadeId: subunidades.id,
      subunidade: subunidades.nome,
    })
    .from(itens)
    .innerJoin(unidades, eq(unidades.id, itens.unidadeId))
    // A subunidade só vale se for da unidade da planilha (a planilha pode ter mudado de unidade).
    .leftJoin(subunidades, and(eq(subunidades.id, itens.subunidadeId), eq(subunidades.reparticaoId, unidades.reparticaoId)))
    .leftJoin(pcaUploads, eq(pcaUploads.id, unidades.uploadId))
    .where(eq(unidades.pcaId, pcaId))
    .orderBy(desc(itens.sequencial));
}
