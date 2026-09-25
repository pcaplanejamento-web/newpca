import { eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { orcamentoItens, orcamentos } from "../db/schema.ts";

type Db = DrizzleD1Database<typeof schema>;

/**
 * REENVIO do CUBO — os comandos da SUBSTITUIÇÃO como BUILDERS do Drizzle (sem getDb: testados pelo driver D1 REAL
 * dentro de `db.batch`, como o `rastro-sql.ts`). Na ordem, num lote atômico: apaga os lançamentos do `alvoId`, move os
 * do `origemId` (o envio temporário da planilha nova) para ele, recalcula os totais do alvo e apaga a origem.
 */
export function comandosSubstituirLancamentos(db: Db, alvoId: number, origemId: number) {
  return [
    db.delete(orcamentoItens).where(eq(orcamentoItens.orcamentoId, alvoId)),
    db.update(orcamentoItens).set({ orcamentoId: alvoId }).where(eq(orcamentoItens.orcamentoId, origemId)),
    db
      .update(orcamentos)
      .set({
        totalItens: sql`(SELECT COUNT(*) FROM orcamento_itens WHERE orcamento_id = ${alvoId})`,
        valorInicial: sql`(SELECT COALESCE(SUM(valor_inicial), 0) FROM orcamento_itens WHERE orcamento_id = ${alvoId})`,
        atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(orcamentos.id, alvoId)),
    db.delete(orcamentos).where(eq(orcamentos.id, origemId)),
  ] as const;
}
