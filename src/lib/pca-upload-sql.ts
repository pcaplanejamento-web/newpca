import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { itens, pcaItens, pcas, pcaUploads, subunidades, unidades } from "../db/schema.ts";

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

/** Os nºs CANCELADOS da planilha entre os informados — o cancelado nunca é sobrescrito por um upload (reative-o antes). */
export function consultaSequenciaisCancelados(db: Db, pcaId: number, seqs: readonly number[]) {
  return db
    .select({ sequencial: itens.sequencial })
    .from(itens)
    .where(and(eq(itens.pcaId, pcaId), isNotNull(itens.canceladoEm), inArray(itens.sequencial, lista(seqs))));
}

/** CANCELA (`cancelar`) ou REATIVA itens da planilha do PCA — só os que mudam de estado; os totais vêm no mesmo lote. */
export function comandoCancelarItens(db: Db, pcaId: number, ids: readonly number[], cancelar: boolean, ator: { id: number; nome: string } | null) {
  return db
    .update(itens)
    .set(
      cancelar
        ? { canceladoEm: sql`(CURRENT_TIMESTAMP)`, canceladoPor: ator?.id ?? null, canceladoPorNome: ator?.nome ?? null }
        : { canceladoEm: null, canceladoPor: null, canceladoPorNome: null },
    )
    .where(and(eq(itens.pcaId, pcaId), inArray(itens.id, lista(ids)), cancelar ? isNull(itens.canceladoEm) : isNotNull(itens.canceladoEm)))
    .returning({ id: itens.id, sequencial: itens.sequencial });
}

/** Tira os itens da planilha que já têm esses nºs — o novo os sobrescreve. */
export function comandoSobrescrever(db: Db, pcaId: number, seqs: readonly number[]) {
  // Nunca o CANCELADO (cancelado entre a conferência e o lote): ele fica, e o gatilho do sequencial único aborta o lote.
  return db.delete(itens).where(and(eq(itens.pcaId, pcaId), isNull(itens.canceladoEm), inArray(itens.sequencial, lista(seqs))));
}

/** Recalcula itens e valor de cada planilha do PCA (a sobrescrita tira itens de outras) — SÓ os ATIVOS: o item cancelado
 * (`0180`) não conta (os cards, o Orçamento e os uploads leem estes totais). */
export function comandoTotaisUnidades(db: Db, pcaId: number) {
  return db
    .update(unidades)
    .set({
      totalItens: sql`(SELECT COUNT(*) FROM ${itens} WHERE ${itens.unidadeId} = ${unidades.id} AND ${itens.canceladoEm} IS NULL)`,
      valorTotal: sql`(SELECT COALESCE(SUM(${itens.valorTotal}), 0) FROM ${itens} WHERE ${itens.unidadeId} = ${unidades.id} AND ${itens.canceladoEm} IS NULL)`,
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

/** As SUBUNIDADES (`0181`) dos itens que o upload vai sobrescrever, quando a planilha antiga é da MESMA unidade do sistema
 * que a nova — o upload que regrava o Seq. não apaga o que foi tratado. */
export function consultaSubunidadesDosSeqs(db: Db, pcaId: number, unidadeId: number, seqs: readonly number[]) {
  return db
    .select({ sequencial: itens.sequencial, subunidadeId: itens.subunidadeId })
    .from(itens)
    .innerJoin(unidades, eq(unidades.id, itens.unidadeId))
    .where(
      and(
        eq(itens.pcaId, pcaId),
        isNotNull(itens.subunidadeId),
        inArray(itens.sequencial, lista(seqs)),
        sql`${unidades.reparticaoId} = (SELECT u2.reparticao_id FROM ${unidades} u2 WHERE u2.id = ${unidadeId})`,
      ),
    );
}

/** Devolve a subunidade aos itens recém-gravados da planilha (pares [seq, subunidade]), no MESMO lote do INSERT. */
export function comandoRestaurarSubunidades(db: Db, pcaId: number, unidadeId: number, pares: readonly [number, number][]) {
  const j = JSON.stringify(pares);
  return db
    .update(itens)
    .set({ subunidadeId: sql`(SELECT json_extract(value, '$[1]') FROM json_each(${j}) WHERE json_extract(value, '$[0]') = ${itens.sequencial})` })
    .where(and(eq(itens.pcaId, pcaId), eq(itens.unidadeId, unidadeId), inArray(itens.sequencial, sql`(SELECT json_extract(value, '$[0]') FROM json_each(${j}))`)));
}

/** Os itens da planilha do PCA para a SUBUNIDADE em massa: a unidade do sistema de cada um e se está cancelado. */
export function consultaItensParaSubunidade(db: Db, pcaId: number, ids: readonly number[]) {
  return db
    .select({ id: itens.id, sequencial: itens.sequencial, reparticaoId: unidades.reparticaoId, canceladoEm: itens.canceladoEm, subunidadeId: itens.subunidadeId })
    .from(itens)
    .innerJoin(unidades, eq(unidades.id, itens.unidadeId))
    .where(and(eq(itens.pcaId, pcaId), inArray(itens.id, lista(ids))));
}

/** Grava a SUBUNIDADE (ou tira — null) nos itens ATIVOS da planilha do PCA cuja planilha é da unidade `reparticaoId`; a
 * subunidade, quando informada, tem de ser dessa unidade (conferido no próprio SQL). */
export function comandoSubunidadeItens(db: Db, pcaId: number, ids: readonly number[], reparticaoId: number, subunidadeId: number | null) {
  return db
    .update(itens)
    .set({ subunidadeId })
    .where(
      and(
        eq(itens.pcaId, pcaId),
        inArray(itens.id, lista(ids)),
        isNull(itens.canceladoEm),
        sql`${itens.unidadeId} IN (SELECT ${unidades.id} FROM ${unidades} WHERE ${unidades.reparticaoId} = ${reparticaoId})`,
        subunidadeId == null ? sql`1` : sql`EXISTS (SELECT 1 FROM ${subunidades} WHERE ${subunidades.id} = ${subunidadeId} AND ${subunidades.reparticaoId} = ${reparticaoId})`,
      ),
    )
    .returning({ id: itens.id, sequencial: itens.sequencial });
}
