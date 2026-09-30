import { and, asc, eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { auditoria } from "../db/schema.ts";

/**
 * HISTÓRICO — as consultas como BUILDERS do Drizzle, sem getDb (testadas pelo driver D1 sobre `node:sqlite`).
 */
type Db = DrizzleD1Database<typeof schema>;

/** O 1º registro de um cadastro no histórico (o da CRIAÇÃO): quem, a ação e se foi na última hora. */
export function consultaPrimeiroRegistro(db: Db, entidade: string, entidadeId: number) {
  return db
    .select({
      usuarioId: auditoria.usuarioId,
      acao: auditoria.acao,
      recente: sql<number>`(${auditoria.criadoEm} >= datetime('now', '-60 minutes'))`,
    })
    .from(auditoria)
    .where(and(eq(auditoria.entidade, entidade), eq(auditoria.entidadeId, entidadeId)))
    .orderBy(asc(auditoria.id))
    .limit(1);
}

/** O cadastro foi CRIADO por esta pessoa, por IMPORTAÇÃO, na última hora? (a leitura do 1º registro) */
export function criadoPorImportacaoDe(
  primeiro: { usuarioId: number | null; acao: string; recente: number | boolean | null } | undefined,
  usuarioId: number,
): boolean {
  return !!primeiro && primeiro.usuarioId === usuarioId && primeiro.acao === "importar" && Number(primeiro.recente) === 1;
}
