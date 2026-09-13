import { desc, eq, sql } from "drizzle-orm";
import { dfdProtocolos, dfds, reparticoes } from "@/db/schema";
import { criarOuSubstituirDfd, type DfdResumo, listarDfdsDoProtocolo } from "./dfd";
import type { ProtocoloImportPayload } from "./dfd-validation";
import { getDb } from "./db";

/**
 * Acesso a dados do PROTOCOLO (o "processo" que empacota vários DFDs). Escopo por
 * REPARTIÇÃO (como `dfds`). Os totais (nº de DFDs, itens, valor) são recompostos
 * AO VIVO a partir dos DFDs vinculados — o vínculo é dinâmico (protocolar,
 * vincular/desvincular, re-importar). Reaproveita `criarOuSubstituirDfd`.
 */

type ProtocoloMeta = ProtocoloImportPayload["protocolo"];

export type ProtocoloResumo = {
  id: number;
  numero: string;
  interessado: string | null;
  assunto: string | null;
  data: string | null;
  valorCapa: number | null;
  reparticaoId: number | null;
  reparticaoCodigo: string | null;
  reparticaoNome: string | null;
  totalDfds: number;
  totalItens: number;
  valorTotal: number;
  criadoEm: string | null;
};

export type ProtocoloDetalhe = ProtocoloResumo & {
  documento: string | null;
  observacao: string | null;
  localReparticao: string | null;
  nomeArquivo: string | null;
  dfds: DfdResumo[];
};

// Valor de um DFD p/ somatório: total da tabela, senão o estimado.
const VALOR_DFD = sql<number>`COALESCE(${dfds.valorTotal}, ${dfds.valorEstimado}, 0)`;

/** Protocolos (opcionalmente filtrados por repartição — Geral passa `undefined`),
 * com totais agregados ao vivo dos DFDs vinculados. */
export async function listarProtocolos(reparticaoId?: number): Promise<ProtocoloResumo[]> {
  return getDb()
    .select({
      id: dfdProtocolos.id,
      numero: dfdProtocolos.numero,
      interessado: dfdProtocolos.interessado,
      assunto: dfdProtocolos.assunto,
      data: dfdProtocolos.data,
      valorCapa: dfdProtocolos.valorCapa,
      reparticaoId: dfdProtocolos.reparticaoId,
      reparticaoCodigo: reparticoes.codigo,
      reparticaoNome: reparticoes.nome,
      criadoEm: dfdProtocolos.criadoEm,
      totalDfds: sql<number>`COUNT(DISTINCT ${dfds.id})`,
      totalItens: sql<number>`COALESCE(SUM(${dfds.totalItens}), 0)`,
      valorTotal: sql<number>`COALESCE(SUM(${VALOR_DFD}), 0)`,
    })
    .from(dfdProtocolos)
    .leftJoin(reparticoes, eq(dfdProtocolos.reparticaoId, reparticoes.id))
    .leftJoin(dfds, eq(dfds.protocoloId, dfdProtocolos.id))
    .where(reparticaoId ? eq(dfdProtocolos.reparticaoId, reparticaoId) : undefined)
    .groupBy(dfdProtocolos.id)
    .orderBy(desc(dfdProtocolos.criadoEm), desc(dfdProtocolos.id));
}

/** Protocolo + seus DFDs (resumo). Totais recompostos ao vivo. */
export async function getProtocolo(id: number): Promise<ProtocoloDetalhe | null> {
  const db = getDb();
  const [p] = await db
    .select({
      id: dfdProtocolos.id,
      numero: dfdProtocolos.numero,
      interessado: dfdProtocolos.interessado,
      assunto: dfdProtocolos.assunto,
      data: dfdProtocolos.data,
      valorCapa: dfdProtocolos.valorCapa,
      documento: dfdProtocolos.documento,
      observacao: dfdProtocolos.observacao,
      localReparticao: dfdProtocolos.localReparticao,
      nomeArquivo: dfdProtocolos.nomeArquivo,
      reparticaoId: dfdProtocolos.reparticaoId,
      reparticaoCodigo: reparticoes.codigo,
      reparticaoNome: reparticoes.nome,
      criadoEm: dfdProtocolos.criadoEm,
    })
    .from(dfdProtocolos)
    .leftJoin(reparticoes, eq(dfdProtocolos.reparticaoId, reparticoes.id))
    .where(eq(dfdProtocolos.id, id))
    .limit(1);
  if (!p) return null;

  const dfdsList = await listarDfdsDoProtocolo(id);
  const totalItens = dfdsList.reduce((s, d) => s + (d.totalItens ?? 0), 0);
  const valorTotal = dfdsList.reduce((s, d) => s + (d.valorTotal ?? d.valorEstimado ?? 0), 0);
  return { ...p, totalDfds: dfdsList.length, totalItens, valorTotal, dfds: dfdsList };
}

/** Cria/atualiza (upsert pelo `numero`) o protocolo a partir da capa. */
async function upsertProtocolo(
  p: ProtocoloMeta,
  criadoPor: number | null,
): Promise<{ id: number; numero: string }> {
  const db = getDb();
  const set = {
    data: p.data ?? null,
    interessado: p.interessado ?? null,
    documento: p.documento ?? null,
    assunto: p.assunto ?? null,
    observacao: p.observacao ?? null,
    valorCapa: p.valorCapa ?? null,
    reparticaoId: p.reparticaoId ?? null,
    localReparticao: p.localReparticao ?? null,
    nomeArquivo: p.nomeArquivo ?? null,
    atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
  };
  const [row] = await db
    .insert(dfdProtocolos)
    .values({ numero: p.numero, criadoPor: criadoPor ?? null, ...set })
    .onConflictDoUpdate({ target: dfdProtocolos.numero, set })
    .returning({ id: dfdProtocolos.id });
  return { id: row.id, numero: p.numero };
}

/**
 * Protocola um processo com seus DFDs (só os VÁLIDOS — o defeituoso nunca é
 * gravado; a re-validação fica na rota). Também cobre a rule 3 (protocolo sem
 * DFDs): `dfdsValidos` vazio cria apenas o protocolo. Cada DFD é 1 upsert + 1
 * batch de itens, em laço sequencial (respeita o limite de params do D1).
 */
export async function importarProtocoloComDfds(
  protocolo: ProtocoloMeta,
  dfdsValidos: ProtocoloImportPayload["dfds"],
  criadoPor: number | null,
): Promise<{ id: number; numero: string; importados: number }> {
  const { id, numero } = await upsertProtocolo(protocolo, criadoPor);
  for (const d of dfdsValidos) {
    await criarOuSubstituirDfd({ ...d, protocoloId: id }, criadoPor);
  }
  return { id, numero, importados: dfdsValidos.length };
}

/** Vincula (ou desvincula, com `null`) um DFD a um protocolo — rule 4. */
export async function vincularDfd(dfdId: number, protocoloId: number | null): Promise<void> {
  await getDb()
    .update(dfds)
    .set({ protocoloId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(dfds.id, dfdId));
}

/** Exclui o protocolo. Os DFDs permanecem (FK `set null` desvincula). */
export async function excluirProtocolo(id: number): Promise<void> {
  await getDb().delete(dfdProtocolos).where(eq(dfdProtocolos.id, id));
}
