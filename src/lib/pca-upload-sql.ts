import { and, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { itens, pcaItens, pcas, pcaUploads, unidades } from "../db/schema.ts";

/**
 * Os comandos do UPLOAD de planilha no PCA (builders do Drizzle — testados no driver D1 real, dentro de `db.batch`:
 * `tests/sequencial-pca.test.ts`). O SEQUENCIAL é sagrado: o nº que chega SOBRESCREVE o item da planilha que já o tinha
 * (`comandoSobrescrever`, no MESMO lote, antes do INSERT); os totais e as sobras são acertados no fim do lote.
 */
type Db = DrizzleD1Database<typeof schema>;

const lista = (ns: readonly number[]) => sql`(SELECT value FROM json_each(${JSON.stringify(ns)}))`;

/** O MAIOR sequencial do PCA — planilha e protocolos no mesmo espaço. */
export function consultaMaximoSequencial(db: Db, pcaId: number) {
  return db
    .select({
      max: sql<number>`MAX((SELECT COALESCE(MAX(${itens.sequencial}), 0) FROM ${itens} WHERE ${itens.pcaId} = ${pcaId}), (SELECT COALESCE(MAX(${pcaItens.sequencial}), 0) FROM ${pcaItens} WHERE ${pcaItens.pcaId} = ${pcaId}))`,
    })
    .from(pcas)
    .where(eq(pcas.id, pcaId));
}

/** Os nºs pedidos que já são de um item de PROTOCOLO neste PCA (a planilha nunca os toma). */
export function consultaSequenciaisDeProtocolo(db: Db, pcaId: number, seqs: readonly number[]) {
  return db
    .select({ sequencial: pcaItens.sequencial })
    .from(pcaItens)
    .where(and(eq(pcaItens.pcaId, pcaId), inArray(pcaItens.sequencial, lista(seqs))));
}

/** Tira os itens da planilha que já têm esses nºs — o novo os sobrescreve. */
export function comandoSobrescrever(db: Db, pcaId: number, seqs: readonly number[]) {
  return db.delete(itens).where(and(eq(itens.pcaId, pcaId), inArray(itens.sequencial, lista(seqs))));
}

/** Recalcula itens e valor de cada planilha do PCA (a sobrescrita tira itens de outras). */
export function comandoTotaisUnidades(db: Db, pcaId: number) {
  return db
    .update(unidades)
    .set({
      totalItens: sql`(SELECT COUNT(*) FROM ${itens} WHERE ${itens.unidadeId} = ${unidades.id})`,
      valorTotal: sql`(SELECT COALESCE(SUM(${itens.valorTotal}), 0) FROM ${itens} WHERE ${itens.unidadeId} = ${unidades.id})`,
    })
    .where(eq(unidades.pcaId, pcaId));
}

/** A planilha que ficou SEM itens (todos sobrescritos) sai; o upload sem planilhas, também. */
export function comandosLimparVazias(db: Db, pcaId: number) {
  return [
    db.delete(unidades).where(and(eq(unidades.pcaId, pcaId), sql`NOT EXISTS (SELECT 1 FROM ${itens} WHERE ${itens.unidadeId} = ${unidades.id})`)),
    db.delete(pcaUploads).where(and(eq(pcaUploads.pcaId, pcaId), sql`NOT EXISTS (SELECT 1 FROM ${unidades} WHERE ${unidades.uploadId} = ${pcaUploads.id})`)),
  ] as const;
}
