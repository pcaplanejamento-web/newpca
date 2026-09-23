import type { TagSql } from "./rastro-sql.ts";

/**
 * SEQUENCIAL do ITEM no PCA — o SQL PURO (sem getDb; testado em `node:sqlite`), no padrão de `rastro-sql.ts`: o
 * servidor passa o `sql` do Drizzle; os testes, uma tag que monta texto + parâmetros.
 *
 * - `numerarItensDoProtocolo`: na INCORPORAÇÃO (depois do upsert em `pca_dfds`, no MESMO lote atômico), dá a cada
 *   item dos DFDs do protocolo vinculados a ESTE PCA (ação ≠ excluir) o próximo número ÚNICO do PCA (MAX + ordem
 *   estável DFD → sequencial do item). Idempotente: item já numerado neste PCA não ganha outro. Nunca reaproveita
 *   (o MAX conta também os INATIVOS).
 * - `gravarSequencialNosItens`: o item REGISTRA o número no próprio banco (`dfd_itens.pca_id`/`pca_sequencial`).
 */
export function numerarItensDoProtocolo<T>(q: TagSql<T>, pcaId: number, protocoloId: number): T {
  return q`INSERT INTO pca_itens (pca_id, sequencial, dfd_item_id, dfd_id, protocolo_id)
    SELECT ${pcaId}, (SELECT COALESCE(MAX(x.sequencial), 0) FROM pca_itens x WHERE x.pca_id = ${pcaId})
      + ROW_NUMBER() OVER (ORDER BY d.id, i.sequencial, i.id), i.id, d.id, d.protocolo_id
    FROM dfd_itens i
    JOIN dfds d ON d.id = i.dfd_id
    JOIN pca_dfds pd ON pd.dfd_id = d.id AND pd.pca_id = ${pcaId}
    WHERE d.protocolo_id = ${protocoloId} AND pd.acao <> 'excluir'
      AND NOT EXISTS (SELECT 1 FROM pca_itens y WHERE y.pca_id = ${pcaId} AND y.dfd_item_id = i.id)`;
}

export function gravarSequencialNosItens<T>(q: TagSql<T>, pcaId: number, protocoloId: number): T {
  return q`UPDATE dfd_itens SET pca_id = ${pcaId},
      pca_sequencial = (SELECT x.sequencial FROM pca_itens x WHERE x.pca_id = ${pcaId} AND x.dfd_item_id = dfd_itens.id)
    WHERE id IN (SELECT y.dfd_item_id FROM pca_itens y WHERE y.pca_id = ${pcaId} AND y.protocolo_id = ${protocoloId})`;
}
