import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { catalogoCompras, catalogoContratos, catalogoPastas, catalogos } from "../db/schema.ts";
import type { CompraHistoricoImport, ContratoHistoricoImport } from "./catalogo-validation.ts";

type Db = DrizzleD1Database<typeof schema>;

/**
 * Comandos do HISTÓRICO DE COMPRA e das PASTAS do catálogo como BUILDERS do Drizzle (sem getDb — testados pelo driver D1
 * REAL dentro de `db.batch`, `tests/catalogo-historico-sql.test.ts`). Cada INSERT fica abaixo de 100 parâmetros:
 * contrato = 16 colunas → 6 por INSERT (96); item = 21 colunas → 4 por INSERT (84).
 */
export const CONTRATOS_POR_INSERT = 6;
export const COMPRAS_POR_INSERT = 4;

/** Grava (ou regrava — idempotente pelo `id_contrato`) os contratos de um histórico. */
export function comandosContratos(db: Db, catalogoId: number, contratos: readonly ContratoHistoricoImport[]) {
  const out = [];
  for (let i = 0; i < contratos.length; i += CONTRATOS_POR_INSERT) {
    out.push(
      db
        .insert(catalogoContratos)
        .values(contratos.slice(i, i + CONTRATOS_POR_INSERT).map((c) => ({ catalogoId, ...c })))
        .onConflictDoUpdate({
          target: [catalogoContratos.catalogoId, catalogoContratos.idContrato],
          set: {
            numeroContrato: sql`excluded.numero_contrato`,
            idLicitacao: sql`excluded.id_licitacao`,
            numeroLicitacao: sql`excluded.numero_licitacao`,
            orgao: sql`excluded.orgao`,
            unidadeGestora: sql`excluded.unidade_gestora`,
            credor: sql`excluded.credor`,
            valorContrato: sql`excluded.valor_contrato`,
            dataAssinatura: sql`excluded.data_assinatura`,
            dataPublicacao: sql`excluded.data_publicacao`,
            modalidade: sql`excluded.modalidade`,
            protocolo: sql`excluded.protocolo`,
            objeto: sql`excluded.objeto`,
            natureza: sql`excluded.natureza`,
            detalhamento: sql`excluded.detalhamento`,
          },
        }),
    );
  }
  return out;
}

/**
 * Grava um lote de itens do histórico — IDEMPOTENTE: apaga antes os de `ordem` ≥ a menor ordem do lote (repetir o
 * mesmo lote após uma falha não duplica) e recalcula o total do catálogo no mesmo lote.
 */
export function comandosCompras(db: Db, catalogoId: number, rows: readonly CompraHistoricoImport[]) {
  if (rows.length === 0) return [];
  const desde = Math.min(...rows.map((r) => r.ordem));
  const out = [];
  out.push(db.delete(catalogoCompras).where(and(eq(catalogoCompras.catalogoId, catalogoId), gte(catalogoCompras.ordem, desde))));
  for (let i = 0; i < rows.length; i += COMPRAS_POR_INSERT) {
    out.push(db.insert(catalogoCompras).values(rows.slice(i, i + COMPRAS_POR_INSERT).map((r) => ({ catalogoId, ...r }))));
  }
  out.push(comandoTotalHistorico(db, catalogoId));
  return out;
}

/** O total de itens do catálogo de histórico (as linhas compradas). */
export function comandoTotalHistorico(db: Db, catalogoId: number) {
  return db
    .update(catalogos)
    .set({ totalItens: sql`(SELECT COUNT(*) FROM catalogo_compras WHERE catalogo_id = ${catalogoId})`, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(catalogos.id, catalogoId));
}

/** Apaga o histórico de um catálogo (contratos + itens) — junto da exclusão do catálogo. */
export function comandosApagarHistorico(db: Db, catalogoId: number) {
  return [db.delete(catalogoCompras).where(eq(catalogoCompras.catalogoId, catalogoId)), db.delete(catalogoContratos).where(eq(catalogoContratos.catalogoId, catalogoId))];
}

/**
 * Define os catálogos de uma PASTA: a lista inteira — os que estão nela e não vêm saem para a grade; os que vêm entram
 * (saindo de outra pasta, se estavam). Lotes de ≤ 90 ids.
 */
export function comandosCatalogosDaPasta(db: Db, pastaId: number, ids: readonly number[]) {
  const uniq = [...new Set(ids)];
  const out = [];
  out.push(
    uniq.length > 0
      ? db.update(catalogos).set({ pastaId: null }).where(and(eq(catalogos.pastaId, pastaId), sql`${catalogos.id} NOT IN (SELECT value FROM json_each(${JSON.stringify(uniq)}))`))
      : db.update(catalogos).set({ pastaId: null }).where(eq(catalogos.pastaId, pastaId)),
  );
  for (let i = 0; i < uniq.length; i += 90) out.push(db.update(catalogos).set({ pastaId }).where(inArray(catalogos.id, uniq.slice(i, i + 90))));
  return out;
}

/** Exclui a pasta — os catálogos voltam à grade (como o `set null` da FK, explícito no mesmo lote). */
export function comandosExcluirPasta(db: Db, pastaId: number) {
  return [db.update(catalogos).set({ pastaId: null }).where(eq(catalogos.pastaId, pastaId)), db.delete(catalogoPastas).where(eq(catalogoPastas.id, pastaId))];
}

/** Os números do card de cada catálogo, numa consulta: a agenda conta os itens que PERTENCEM (origem + compartilhados é
 * no cliente); o histórico, contratos e o valor contratado. */
export function consultaIndicadoresHistorico(db: Db) {
  return db
    .select({
      catalogoId: catalogoCompras.catalogoId,
      valor: sql<number>`COALESCE(SUM(${catalogoCompras.valorContratado}), 0)`,
      contratos: sql<number>`COUNT(DISTINCT ${catalogoCompras.idContrato})`,
      produtos: sql<number>`COUNT(DISTINCT ${catalogoCompras.codigo})`,
    })
    .from(catalogoCompras)
    .groupBy(catalogoCompras.catalogoId);
}
