import { desc, eq, and, lt, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { centiAlteracoes } from "../db/schema.ts";
import type { TipoAlteracao } from "./centi-alteracoes-core.ts";

/**
 * O HISTÓRICO DAS ALTERAÇÕES da Centi como BUILDERS (testados pelo driver D1 REAL — `tests/centi-somente-mudancas.test.ts`):
 * rodam DENTRO do lote atômico da promoção, ANTES de o gravado mudar, e escrevem UMA linha por registro que mudou de fato
 * (o registro novo não gera histórico — a data de criação já está nele; a troca só do leitor também não).
 */
type Db = DrizzleD1Database<typeof schema>;

const colunaSql = (c: string) => c.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

/** Os campos de DADOS que diferem entre o gravado e o lido, como JSON `[{c, a, d}]` (os iguais não entram). */
function camposQueMudaram(final: string, lido: string, campos: readonly string[]): SQL {
  const itens = campos.map((c) => {
    const col = colunaSql(c);
    return `CASE WHEN "${final}"."${col}" IS NOT "${lido}"."${col}" THEN json_object('c', '${c}', 'a', "${final}"."${col}", 'd', "${lido}"."${col}") END`;
  });
  return sql.raw(`(SELECT json_group_array(json("value")) FROM json_each(json_array(${itens.join(", ")})) WHERE "type" = 'object')`);
}

/** Algum campo de DADOS diferente (sem o vínculo, o leitor e a ausência — esses não são da Centi). */
export function dadosMudaram(final: string, lido: string, campos: readonly string[]): SQL {
  return sql.raw(campos.map((c) => `"${final}"."${colunaSql(c)}" IS NOT "${lido}"."${colunaSql(c)}"`).join(" OR "));
}

/**
 * As ALTERAÇÕES do lote: cada registro do staging (`filtro` = os que serão gravados) que já existe no card e muda algum dado
 * — ou que volta depois de ausente/removido ("restaurado"). Os campos levam o valor de ANTES e o de DEPOIS.
 */
export function comandoAlteracoesDoLote(
  db: Db,
  tipo: TipoAlteracao,
  t: { final: string; staging: string; campos: readonly string[] },
  loteId: number,
  card: number,
  filtro: SQL,
) {
  const f = (c: string) => sql.raw(`"${t.final}"."${c}"`);
  const voltou = sql`(${f("removido_em")} IS NOT NULL OR ${f("ausente_desde_lote")} IS NOT NULL)`;
  const sel = db
    .select({
      id: sql<null>`NULL`.as("id"),
      tipo: sql<string>`${tipo}`.as("tipo"),
      registroId: sql<number>`${f("id")}`.as("registro_id"),
      cardId: sql<number>`${card}`.as("card_id"),
      loteId: sql<number>`${loteId}`.as("lote_id"),
      acao: sql<string>`CASE WHEN ${voltou} THEN 'restaurado' ELSE 'alterado' END`.as("acao"),
      campos: sql<string>`${camposQueMudaram(t.final, t.staging, t.campos)}`.as("campos"),
      em: sql<string>`CURRENT_TIMESTAMP`.as("em"),
    })
    .from(sql`${sql.raw(`"${t.staging}"`)} JOIN ${sql.raw(`"${t.final}"`)} ON ${f("card_id")} = ${card} AND ${f("chave")} = ${sql.raw(`"${t.staging}"."chave"`)}`)
    .where(sql`${sql.raw(`"${t.staging}"."lote_id"`)} = ${loteId} AND ${filtro} AND (${dadosMudaram(t.final, t.staging, t.campos)} OR ${voltou})`);
  return db.insert(centiAlteracoes).select(sel as never);
}

/** Os registros que a Centi NÃO trouxe (`onde`, sobre a tabela final): "ausente" na 1ª vez, "removido" na confirmada. */
export function comandoAlteracoesSumiram(db: Db, tipo: TipoAlteracao, final: string, loteId: number, card: number, onde: SQL) {
  const f = (c: string) => sql.raw(`"${final}"."${c}"`);
  const sel = db
    .select({
      id: sql<null>`NULL`.as("id"),
      tipo: sql<string>`${tipo}`.as("tipo"),
      registroId: sql<number>`${f("id")}`.as("registro_id"),
      cardId: sql<number>`${card}`.as("card_id"),
      loteId: sql<number>`${loteId}`.as("lote_id"),
      acao: sql<string>`CASE WHEN ${f("ausente_desde_lote")} IS NULL THEN 'ausente' ELSE 'removido' END`.as("acao"),
      campos: sql<null>`NULL`.as("campos"),
      em: sql<string>`CURRENT_TIMESTAMP`.as("em"),
    })
    .from(sql.raw(`"${final}"`))
    .where(onde);
  return db.insert(centiAlteracoes).select(sel as never);
}

/** As últimas alterações de UM registro (as mais recentes primeiro). */
export function consultaAlteracoes(db: Db, tipo: TipoAlteracao, registroId: number, limite = 50) {
  return db
    .select()
    .from(centiAlteracoes)
    .where(and(eq(centiAlteracoes.tipo, tipo), eq(centiAlteracoes.registroId, registroId)))
    .orderBy(desc(centiAlteracoes.id))
    .limit(limite);
}

/** A RETENÇÃO: o histórico com mais de `dias` sai (a limpeza do cron). */
export function comandoLimparAlteracoes(db: Db, dias: number) {
  return db.delete(centiAlteracoes).where(lt(centiAlteracoes.em, sql`datetime('now', ${`-${dias} days`})`));
}
