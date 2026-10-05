import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { orcamentoItens, orcamentos } from "../db/schema.ts";

type Db = DrizzleD1Database<typeof schema>;

/**
 * REENVIO do CUBO — os comandos da SUBSTITUIÇÃO como BUILDERS do Drizzle (sem getDb: testados pelo driver D1 REAL
 * dentro de `db.batch`, como o `rastro-sql.ts`). Na ordem, num lote atômico: apaga os lançamentos do `alvoId`, move os
 * do `origemId` (o envio temporário da planilha nova) para ele, recalcula os totais do alvo e apaga os DEMAIS orçamentos
 * do MESMO ANO (a origem e duplicatas antigas, com os lançamentos) — nunca dois orçamentos no mesmo ano, nada residual.
 */
export function comandosSubstituirLancamentos(db: Db, alvoId: number, origemId: number) {
  const outrosDoAno = db
    .select({ id: orcamentos.id })
    .from(orcamentos)
    .where(and(eq(orcamentos.ano, sql`(SELECT ano FROM orcamentos WHERE id = ${alvoId})`), ne(orcamentos.id, alvoId)));
  return [
    db.delete(orcamentoItens).where(eq(orcamentoItens.orcamentoId, alvoId)),
    db.update(orcamentoItens).set({ orcamentoId: alvoId }).where(eq(orcamentoItens.orcamentoId, origemId)),
    db.delete(orcamentoItens).where(inArray(orcamentoItens.orcamentoId, outrosDoAno)),
    db
      .update(orcamentos)
      .set({
        totalItens: sql`(SELECT COUNT(*) FROM orcamento_itens WHERE orcamento_id = ${alvoId})`,
        valorInicial: sql`(SELECT COALESCE(SUM(valor_inicial), 0) FROM orcamento_itens WHERE orcamento_id = ${alvoId})`,
        atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(orcamentos.id, alvoId)),
    db.delete(orcamentos).where(inArray(orcamentos.id, outrosDoAno)),
    db.delete(orcamentos).where(eq(orcamentos.id, origemId)),
  ] as const;
}
