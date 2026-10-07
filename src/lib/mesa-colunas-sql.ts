import { and, eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { mesaColunas, mesaColunasValores } from "../db/schema.ts";
import { chaveColuna, type EntidadeColuna, nomeColuna } from "./mesa-colunas-core.ts";

// COLUNAS DA MESA — só BUILDERS do Drizzle (valem dentro de `db.batch`; testados no driver D1 real em
// `tests/mesa-colunas.test.ts`).

type Db = DrizzleD1Database<Record<string, unknown>>;

/** Linhas por INSERT: 3 parâmetros cada → 30 × 3 = 90, abaixo dos 100 do D1. */
export const LOTE_VALORES = 30;

/** Cria a coluna (a mesma de nome igual, sem caixa/acento, já existente não é criada de novo). */
export function comandoCriarColuna(db: Db, entidade: EntidadeColuna, nome: string, usuarioId: number | null) {
  return db
    .insert(mesaColunas)
    .values({ entidade, nome: nomeColuna(nome), chave: chaveColuna(nome), criadoPor: usuarioId })
    .onConflictDoNothing({ target: [mesaColunas.entidade, mesaColunas.chave] });
}
export function consultaColunaPorNome(db: Db, entidade: EntidadeColuna, nome: string) {
  return db
    .select({ id: mesaColunas.id, entidade: mesaColunas.entidade, nome: mesaColunas.nome })
    .from(mesaColunas)
    .where(and(eq(mesaColunas.entidade, entidade), eq(mesaColunas.chave, chaveColuna(nome))));
}

/** Grava os valores (o mesmo registro de novo troca o valor; `null` apaga) — INSERTs de 30 + um DELETE dos vazios. */
export function comandosGravarValores(db: Db, colunaId: number, valores: { alvoId: number; valor: string | null }[]) {
  const unicos = [...new Map(valores.map((v) => [v.alvoId, v])).values()];
  const gravar = unicos.filter((v): v is { alvoId: number; valor: string } => v.valor != null);
  const apagar = unicos.filter((v) => v.valor == null).map((v) => v.alvoId);
  const cmds = [];
  for (let i = 0; i < gravar.length; i += LOTE_VALORES)
    cmds.push(
      db
        .insert(mesaColunasValores)
        .values(gravar.slice(i, i + LOTE_VALORES).map((v) => ({ colunaId, alvoId: v.alvoId, valor: v.valor })))
        .onConflictDoUpdate({
          target: [mesaColunasValores.colunaId, mesaColunasValores.alvoId],
          set: { valor: sql`excluded.valor`, atualizadoEm: sql`CURRENT_TIMESTAMP` },
        }),
    );
  if (apagar.length)
    cmds.push(
      db
        .delete(mesaColunasValores)
        .where(and(eq(mesaColunasValores.colunaId, colunaId), sql`${mesaColunasValores.alvoId} IN (SELECT value FROM json_each(${JSON.stringify(apagar)}))`)),
    );
  return cmds;
}
