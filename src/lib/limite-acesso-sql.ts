import { and, eq, gt, lte, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { desafiosAcesso, limitesAcesso } from "../db/schema.ts";

/**
 * SEGURANÇA DO ACESSO — os comandos como BUILDERS do Drizzle (sem getDb: testados pelo driver D1 REAL sobre `node:sqlite`).
 * A contagem é UM upsert atômico (duas requisições ao mesmo tempo nunca contam uma só) e o desafio é CONSUMIDO por um
 * DELETE … RETURNING (vale uma vez, mesmo com duas requisições simultâneas).
 */
type Db = DrizzleD1Database<typeof schema>;

/** Conta UMA tentativa na chave: janela vencida (início ≤ `corte`) recomeça em 1. Devolve a contagem e o início. */
export function comandoContarTentativa(db: Db, chave: string, agoraS: number, corte: number) {
  const vencida = sql`${limitesAcesso.inicio} <= ${corte}`;
  return db
    .insert(limitesAcesso)
    .values({ chave, contagem: 1, inicio: agoraS })
    .onConflictDoUpdate({
      target: limitesAcesso.chave,
      set: {
        contagem: sql`CASE WHEN ${vencida} THEN 1 ELSE ${limitesAcesso.contagem} + 1 END`,
        inicio: sql`CASE WHEN ${vencida} THEN excluded.inicio ELSE ${limitesAcesso.inicio} END`,
      },
    })
    .returning({ contagem: limitesAcesso.contagem, inicio: limitesAcesso.inicio });
}

/** A contagem da chave na janela atual (sem contar) — nenhuma linha = nada na janela. */
export function consultaTentativas(db: Db, chave: string, corte: number) {
  return db
    .select({ contagem: limitesAcesso.contagem, inicio: limitesAcesso.inicio })
    .from(limitesAcesso)
    .where(and(eq(limitesAcesso.chave, chave), gt(limitesAcesso.inicio, corte)))
    .limit(1);
}

/** Zera a chave (ex.: o login deu certo). */
export function comandoZerarTentativas(db: Db, chave: string) {
  return db.delete(limitesAcesso).where(eq(limitesAcesso.chave, chave));
}

/** Higiene: as contagens mais velhas que `corte` (nenhuma regra tem janela maior). */
export function comandoLimparTentativas(db: Db, corte: number) {
  return db.delete(limitesAcesso).where(lte(limitesAcesso.inicio, corte));
}

/** Grava um desafio novo da verificação anti-robô. */
export function comandoCriarDesafio(db: Db, id: string, expiraEm: number) {
  return db.insert(desafiosAcesso).values({ id, expiraEm });
}

/** CONSOME o desafio (apaga e devolve) — só se ainda vale. Nenhuma linha = inexistente, usado ou vencido. */
export function comandoConsumirDesafio(db: Db, id: string, agoraS: number) {
  return db
    .delete(desafiosAcesso)
    .where(and(eq(desafiosAcesso.id, id), gt(desafiosAcesso.expiraEm, agoraS)))
    .returning({ id: desafiosAcesso.id });
}

/** Higiene: os desafios vencidos. */
export function comandoLimparDesafios(db: Db, agoraS: number) {
  return db.delete(desafiosAcesso).where(lte(desafiosAcesso.expiraEm, agoraS));
}
