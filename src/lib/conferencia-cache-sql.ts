import { and, eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { conferencias, dfdProtocolos, dfds } from "../db/schema.ts";

type Db = DrizzleD1Database<typeof schema>;
export type TipoConferencia = "dfd" | "protocolo";
export type ConferenciaGravar = { alvoId: number; assinatura: string; resultado: string };

/** Linhas por INSERT (4 parâmetros cada — ≤ 100 por statement no D1). */
export const LINHAS_POR_INSERT = 24;

/** As conferências GUARDADAS dos alvos (os ids num só parâmetro JSON — sem o teto de parâmetros). Builder puro. */
export function consultaConferencias(db: Db, tipo: TipoConferencia, ids: number[]) {
  return db
    .select({ alvoId: conferencias.alvoId, assinatura: conferencias.assinatura, resultado: conferencias.resultado })
    .from(conferencias)
    .where(and(eq(conferencias.tipo, tipo), sql`${conferencias.alvoId} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`));
}

/** Grava (upsert) as conferências calculadas — em INSERTs de `LINHAS_POR_INSERT`. Builders para `db.batch`. */
export function comandosGravarConferencias(db: Db, tipo: TipoConferencia, linhas: ConferenciaGravar[]) {
  const cmds = [];
  for (let i = 0; i < linhas.length; i += LINHAS_POR_INSERT) {
    const fatia = linhas.slice(i, i + LINHAS_POR_INSERT);
    cmds.push(
      db
        .insert(conferencias)
        .values(fatia.map((l) => ({ tipo, alvoId: l.alvoId, assinatura: l.assinatura, resultado: l.resultado })))
        .onConflictDoUpdate({
          target: [conferencias.tipo, conferencias.alvoId],
          set: { assinatura: sql`excluded.assinatura`, resultado: sql`excluded.resultado`, em: sql`CURRENT_TIMESTAMP` },
        }),
    );
  }
  return cmds;
}

/** Apaga as conferências de DFDs/protocolos que não existem mais (higiene do cron). */
export function comandosLimparOrfas(db: Db) {
  return [
    db.delete(conferencias).where(and(eq(conferencias.tipo, "dfd"), sql`NOT EXISTS (SELECT 1 FROM ${dfds} WHERE ${dfds.id} = ${conferencias.alvoId})`)),
    db
      .delete(conferencias)
      .where(and(eq(conferencias.tipo, "protocolo"), sql`NOT EXISTS (SELECT 1 FROM ${dfdProtocolos} WHERE ${dfdProtocolos.id} = ${conferencias.alvoId})`)),
  ];
}
