import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { auditoria, dfdProtocolos, dfds } from "../db/schema.ts";
import { filtroAnoPcaProtocolo } from "./dfd-sql.ts";

/**
 * HISTÓRICO DE EXECUÇÃO da Mesa (as métricas de governança do Dashboard) — a consulta como BUILDER do Drizzle (sem
 * getDb: testada pelo driver D1 REAL sobre `node:sqlite`). Lê a `auditoria` SÓ dos protocolos DA MESA principal — o
 * MESMO escopo das listas: fora de um PCA (`pca_id IS NULL`), a unidade ativa (`null` = Geral, todas) e o PCA do
 * cabeçalho (`filtroAnoPcaProtocolo`) — e agrega por protocolo, pessoa, dia (Brasília) e TIPO:
 *
 * - `reenvio` — o protocolo voltou CORRIGIDO (`origem='reenvio'`; nas linhas antigas, antes da origem existir, o
 *   "REENVIADO" do resumo);
 * - `acao` — a EXECUÇÃO feita por alguém nos protocolos/DFDs/itens: edições no banner, em massa e na tabela, vínculos,
 *   exclusões (as linhas antigas sem origem também) e a sobrescrita de um DFD.
 *
 * A protocolação e as gravações que a acompanham (importar) NÃO são ações — a entrada já conta pela data do protocolo.
 */
type Db = DrizzleD1Database<typeof schema>;

/** O protocolo de cada linha: `protocolo_id` (desde a 0031) ou, nas antigas, o próprio protocolo (`entidade_id`) ou o
 * protocolo ATUAL do DFD — a MESMA régua do `historicoProtocolo`. */
const protocoloDaLinha = sql<number>`COALESCE(${auditoria.protocoloId}, CASE ${auditoria.entidade} WHEN 'protocolo' THEN ${auditoria.entidadeId} WHEN 'dfd' THEN (SELECT ${dfds.protocoloId} FROM ${dfds} WHERE ${dfds.id} = ${auditoria.entidadeId}) END)`;

/** O tipo da linha (`null` = não é execução: protocolação, importação, login…). */
export const tipoAtividadeSql = sql<"reenvio" | "acao" | null>`CASE
  WHEN ${auditoria.entidade} = 'protocolo' AND (${auditoria.origem} = 'reenvio' OR (${auditoria.origem} IS NULL AND ${auditoria.acao} = 'importar' AND ${auditoria.resumo} LIKE '%REENVIADO%')) THEN 'reenvio'
  WHEN ${auditoria.acao} IN ('editar', 'excluir') AND (${auditoria.origem} IS NULL OR ${auditoria.origem} IN ('banner', 'massa', 'celula', 'vinculo', 'exclusao')) THEN 'acao'
  WHEN ${auditoria.entidade} = 'dfd' AND ${auditoria.acao} = 'importar' AND ${auditoria.origem} = 'sobrescrita' THEN 'acao'
END`;

/** Dia de CALENDÁRIO em Brasília (UTC−3, sem horário de verão desde 2019) do timestamp UTC do banco. */
const diaBrasilia = sql<string>`date(${auditoria.criadoEm}, '-3 hours')`;

export function consultaExecucao(db: Db, escopo: { reparticaoId: number | null; anoPca: number | null }) {
  const unidade = escopo.reparticaoId != null ? sql` AND p2."reparticao_id" = ${escopo.reparticaoId}` : sql``;
  return db
    .select({
      protocoloId: dfdProtocolos.id,
      usuarioId: auditoria.usuarioId,
      dia: diaBrasilia,
      tipo: tipoAtividadeSql,
      n: sql<number>`count(*)`.mapWith(Number),
    })
    .from(auditoria)
    .innerJoin(dfdProtocolos, eq(dfdProtocolos.id, protocoloDaLinha))
    .where(
      and(
        inArray(auditoria.entidade, ["protocolo", "dfd"]),
        sql`${tipoAtividadeSql} IS NOT NULL`,
        isNull(dfdProtocolos.pcaId),
        escopo.reparticaoId != null ? eq(dfdProtocolos.reparticaoId, escopo.reparticaoId) : undefined,
        filtroAnoPcaProtocolo(escopo.anoPca),
        // Limite pelo protocolo MAIS ANTIGO da Mesa no escopo (nenhuma execução vem antes da protocolação): o índice
        // da data não deixa a consulta varrer o histórico inteiro.
        sql`${auditoria.criadoEm} >= (SELECT MIN(p2."criado_em") FROM "dfd_protocolos" AS p2 WHERE p2."pca_id" IS NULL${unidade})`,
      ),
    )
    .groupBy(dfdProtocolos.id, auditoria.usuarioId, diaBrasilia, tipoAtividadeSql);
}
