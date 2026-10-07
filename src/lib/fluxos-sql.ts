import { and, eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { automacaoProgresso } from "../db/schema.ts";

// RETOMADA dos subfluxos — só BUILDERS do Drizzle (valem dentro de `db.batch`; testados no driver D1 real em
// `tests/fluxos-sql.test.ts`). Uma linha por item já processado por um nó "Executar fluxo".

type Db = DrizzleD1Database<Record<string, unknown>>;

/** Linhas por INSERT: 4 parâmetros cada → 24 × 4 = 96, abaixo dos 100 do D1. */
export const LOTE_PROGRESSO = 24;

/** As chaves já concluídas (ok) de um nó. */
export function consultaProgresso(db: Db, fluxoId: number, no: string) {
  return db
    .select({ chave: automacaoProgresso.chave })
    .from(automacaoProgresso)
    .where(and(eq(automacaoProgresso.fluxoId, fluxoId), eq(automacaoProgresso.no, no), eq(automacaoProgresso.estado, "ok")));
}

/** Grava (ou atualiza) o estado de cada chave — o mesmo item de novo só muda o estado. */
export function comandosGravarProgresso(db: Db, fluxoId: number, no: string, itens: { chave: string; estado: "ok" | "falha" }[]) {
  const unicos = [...new Map(itens.map((i) => [i.chave, i])).values()];
  const cmds = [];
  for (let i = 0; i < unicos.length; i += LOTE_PROGRESSO)
    cmds.push(
      db
        .insert(automacaoProgresso)
        .values(unicos.slice(i, i + LOTE_PROGRESSO).map((x) => ({ fluxoId, no, chave: x.chave, estado: x.estado })))
        .onConflictDoUpdate({
          target: [automacaoProgresso.fluxoId, automacaoProgresso.no, automacaoProgresso.chave],
          set: { estado: sql`excluded.estado`, em: sql`CURRENT_TIMESTAMP` },
        }),
    );
  return cmds;
}

/** Esquece o progresso de um nó (recomeça do zero). */
export function comandoLimparProgresso(db: Db, fluxoId: number, no: string) {
  return db.delete(automacaoProgresso).where(and(eq(automacaoProgresso.fluxoId, fluxoId), eq(automacaoProgresso.no, no)));
}
