import { desc, eq, sql } from "drizzle-orm";
import { dfdProtocolos, dfds, reparticoes } from "@/db/schema";
import { type DfdResumo, listarDfdsDoProtocolo } from "./dfd";
import type { ProtocoloMetaPayload } from "./dfd-validation";
import { getDb } from "./db";

/**
 * Acesso a dados do PROTOCOLO (o "processo" que empacota vários DFDs). Escopo por
 * REPARTIÇÃO (como `dfds`). Os totais (nº de DFDs, itens, valor) são recompostos
 * AO VIVO a partir dos DFDs vinculados — o vínculo é dinâmico (protocolar,
 * vincular/desvincular, re-importar). Os DFDs são gravados em streaming pelo
 * cliente (`POST /api/dfd`); aqui só se cria/lê/exclui o protocolo.
 */

type ProtocoloMeta = ProtocoloMetaPayload;

export type ProtocoloResumo = {
  id: number;
  numero: string;
  idExterno: string | null;
  anoPca: number | null;
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
      idExterno: dfdProtocolos.idExterno,
      anoPca: dfdProtocolos.anoPca,
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
      idExterno: dfdProtocolos.idExterno,
      anoPca: dfdProtocolos.anoPca,
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

/**
 * `start-protocolo`: cria/atualiza (upsert pelo `numero`) só o protocolo a partir
 * da capa e devolve o id. Os DFDs são enviados depois, em streaming, pelo cliente
 * (`POST /api/dfd` com `protocoloId`). Cobre também "novo protocolo vazio".
 */
export async function iniciarProtocolo(
  p: ProtocoloMeta,
  criadoPor: number | null,
): Promise<{ id: number; numero: string }> {
  const db = getDb();
  const set = {
    idExterno: p.idExterno ?? null,
    anoPca: p.anoPca ?? null,
    data: p.data ?? null,
    interessado: p.interessado ?? null,
    documento: p.documento ?? null,
    assunto: p.assunto ?? null,
    observacao: p.observacao ?? null,
    valorCapa: p.valorCapa ?? null,
    reparticaoId: p.reparticaoId ?? null,
    orgaoId: p.orgaoId ?? null,
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
 * Edita um protocolo JÁ GRAVADO (banner destravado). Os DADOS DA CAPA são IMUTÁVEIS
 * — só a **repartição** (roteamento/escopo) muda. Grava direto no D1 (`atualizadoEm`
 * renovado).
 */
export async function atualizarProtocolo(
  id: number,
  campos: { reparticaoId?: number | null },
): Promise<void> {
  const set: Record<string, unknown> = { atualizadoEm: sql`(CURRENT_TIMESTAMP)` };
  if (campos.reparticaoId !== undefined) set.reparticaoId = campos.reparticaoId;
  await getDb().update(dfdProtocolos).set(set).where(eq(dfdProtocolos.id, id));
}

/** Vincula (ou desvincula, com `null`) um DFD a um protocolo — rule 4. */
export async function vincularDfd(dfdId: number, protocoloId: number | null): Promise<void> {
  await getDb()
    .update(dfds)
    .set({ protocoloId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(dfds.id, dfdId));
}

/** Repartição de um protocolo (para o guard de acesso nas escritas); `null` se não existe. */
export async function getProtocoloReparticao(id: number): Promise<{ reparticaoId: number | null } | null> {
  const [r] = await getDb()
    .select({ reparticaoId: dfdProtocolos.reparticaoId })
    .from(dfdProtocolos)
    .where(eq(dfdProtocolos.id, id))
    .limit(1);
  return r ?? null;
}

/** Exclui o protocolo. Os DFDs permanecem (FK `set null` desvincula). */
export async function excluirProtocolo(id: number): Promise<void> {
  await getDb().delete(dfdProtocolos).where(eq(dfdProtocolos.id, id));
}
