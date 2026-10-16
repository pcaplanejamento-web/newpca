import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { orcamentoItens, orcamentos, orcamentoVinculos, orcamentoVisoes } from "../db/schema.ts";
import type { DestinoVinculos } from "./orcamento-vinculo.ts";

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

/**
 * VÍNCULOS POR VISÃO — a lista INTEIRA de uma unidade do CUBO num destino (o padrão = `visaoId` null, ou uma visão):
 * apaga as linhas do destino e insere as novas (7 parâmetros por linha → 14 por INSERT = 98). Num `db.batch`, com o
 * `comandoPropriasVisao` das visões que passam a definir a unidade.
 */
export function comandosDestinoVinculos(db: Db, d: DestinoVinculos) {
  const onde = and(eq(orcamentoVinculos.chave, d.chave), d.visaoId == null ? isNull(orcamentoVinculos.visaoId) : eq(orcamentoVinculos.visaoId, d.visaoId));
  const linhas = d.lista.map((v) => ({
    tipo: "unidade" as const,
    chave: d.chave,
    texto: v.texto,
    reparticaoId: v.alvoId,
    acoes: v.acoes == null ? null : JSON.stringify(v.acoes),
    acoesFora: v.acoes == null && v.acoesFora.length ? JSON.stringify(v.acoesFora) : null,
    visaoId: d.visaoId,
  }));
  const inserts = [];
  for (let i = 0; i < linhas.length; i += 14) inserts.push(db.insert(orcamentoVinculos).values(linhas.slice(i, i + 14)));
  return [db.delete(orcamentoVinculos).where(onde), ...inserts];
}

/** As unidades do CUBO (chaves) com vínculos PRÓPRIOS na visão. */
export function comandoPropriasVisao(db: Db, visaoId: number, proprias: string[]) {
  return db
    .update(orcamentoVisoes)
    .set({ vinculosProprios: JSON.stringify([...new Set(proprias)]) })
    .where(eq(orcamentoVisoes.id, visaoId));
}
