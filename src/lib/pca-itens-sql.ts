import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { dfdItens, dfds, pcaDfds, pcaItens } from "../db/schema.ts";

/**
 * SEQUENCIAL do ITEM no PCA — os comandos como BUILDERS do Drizzle (sem getDb: testados pelo driver D1 sobre
 * `node:sqlite`, DENTRO de `db.batch` — `tests/pca-itens-sql.test.ts`). Builders, e não `db.run(sql…)`: no driver
 * D1 um comando cru com parâmetros quebra dentro de `db.batch` (ver `rastro-sql.ts`).
 *
 * - `numerarItensDoProtocolo`: na INCORPORAÇÃO (depois do upsert em `pca_dfds`, no MESMO lote atômico), dá a cada
 *   item dos DFDs do protocolo vinculados a ESTE PCA (ação ≠ excluir) o próximo número ÚNICO do PCA (MAX + ordem
 *   estável DFD → sequencial do item). Idempotente: item já numerado neste PCA não ganha outro. Nunca reaproveita
 *   (o MAX conta também os INATIVOS).
 * - `gravarSequencialNosItens`: o item REGISTRA o número no próprio banco (`dfd_itens.pca_id`/`pca_sequencial`).
 */
type Db = DrizzleD1Database<typeof schema>;

export function numerarItensDoProtocolo(db: Db, pcaId: number, protocoloId: number) {
  // As chaves na MESMA ordem das colunas da tabela (exigência do insert…select do Drizzle).
  const numerados = db
    .select({
      id: sql<number>`NULL`.as("id"),
      pcaId: sql<number>`${pcaId}`.as("pca_id"),
      sequencial:
        sql<number>`(SELECT COALESCE(MAX(x.sequencial), 0) FROM pca_itens x WHERE x.pca_id = ${pcaId}) + ROW_NUMBER() OVER (ORDER BY ${dfds.id}, ${dfdItens.sequencial}, ${dfdItens.id})`.as(
          "sequencial",
        ),
      dfdItemId: dfdItens.id,
      dfdId: dfds.id,
      protocoloId: dfds.protocoloId,
      ativo: sql<number>`1`.as("ativo"),
      inativadoEm: sql<string | null>`NULL`.as("inativado_em"),
      inativadoPor: sql<number | null>`NULL`.as("inativado_por"),
      motivo: sql<string | null>`NULL`.as("motivo"),
      criadoEm: sql<string>`CURRENT_TIMESTAMP`.as("criado_em"),
    })
    .from(dfdItens)
    .innerJoin(dfds, eq(dfds.id, dfdItens.dfdId))
    .innerJoin(pcaDfds, and(eq(pcaDfds.dfdId, dfds.id), eq(pcaDfds.pcaId, pcaId)))
    .where(
      and(
        eq(dfds.protocoloId, protocoloId),
        ne(pcaDfds.acao, "excluir"),
        sql`NOT EXISTS (SELECT 1 FROM pca_itens y WHERE y.pca_id = ${pcaId} AND y.dfd_item_id = ${dfdItens.id})`,
      ),
    );
  return db.insert(pcaItens).select(numerados);
}

export function gravarSequencialNosItens(db: Db, pcaId: number, protocoloId: number) {
  return db
    .update(dfdItens)
    .set({
      pcaId,
      pcaSequencial: sql`(SELECT x.sequencial FROM pca_itens x WHERE x.pca_id = ${pcaId} AND x.dfd_item_id = ${dfdItens.id})`,
    })
    .where(
      inArray(
        dfdItens.id,
        db
          .select({ id: pcaItens.dfdItemId })
          .from(pcaItens)
          .where(and(eq(pcaItens.pcaId, pcaId), eq(pcaItens.protocoloId, protocoloId))),
      ),
    );
}
