import { and, count, eq, isNull, notInArray, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { centiLotePassos, centiLotes, empenhos, empenhosStaging } from "../db/schema.ts";
import type { LinhaEmpenho, PassoLote, Periodo } from "./empenhos-core.ts";

/**
 * EMPENHOS — os comandos da importação como BUILDERS do Drizzle (testados pelo driver D1 REAL sobre `node:sqlite`,
 * dentro de `db.batch` — `tests/empenhos.test.ts`). A página inteira vai num ÚNICO parâmetro JSON (`json_each`): um
 * comando por página, nunca o teto de 100 parâmetros do D1.
 */
type Db = DrizzleD1Database<typeof schema>;

const CAMPOS = [
  "chave",
  "ano",
  "srcId",
  "numero",
  "data",
  "orgaoGestor",
  "unidadeOrcamentaria",
  "fornecedor",
  "cpfCnpj",
  "modalidade",
  "licitacao",
  "funcao",
  "subfuncao",
  "programa",
  "acao",
  "elemento",
  "subelemento",
  "fonte",
  "valorEmpenhado",
  "valorAnulado",
  "valorLiquidado",
  "valorPago",
  "saldoPagar",
  "historico",
] as const satisfies readonly (keyof LinhaEmpenho)[];

/** Guarda as linhas de UMA página no staging do lote (a chave repetida no lote fica com a 1ª). */
export function comandoGuardarPagina(db: Db, loteId: number, pagina: number, linhas: LinhaEmpenho[]) {
  const json = JSON.stringify(linhas.map((l) => CAMPOS.map((c) => l[c])));
  // As chaves na MESMA ordem das colunas da tabela (exigência do insert…select).
  const sel = db
    .select({
      loteId: sql<number>`${loteId}`.as("lote_id"),
      pagina: sql<number>`${pagina}`.as("pagina"),
      ...Object.fromEntries(CAMPOS.map((c, i) => [c, sql`json_extract(value, ${`$[${i}]`})`.as(c)])),
    })
    .from(sql`json_each(${json})`)
    // O WHERE desfaz a ambiguidade do SQLite entre "SELECT … ON CONFLICT" e a junção (exigido no upsert com SELECT).
    .where(sql`1`);
  return db.insert(empenhosStaging).select(sel as never).onConflictDoNothing();
}

/** Registra um PASSO do lote (um pedido à Centi, lido ou com erro) — o que a tela acompanha ao vivo. */
export function comandoRegistrarPasso(db: Db, loteId: number, p: Omit<PassoLote, "id" | "em">) {
  return db.insert(centiLotePassos).values({ loteId, ...p, fimPeriodo: p.fimPeriodo ? 1 : 0 });
}

/** O período grande demais é DIVIDIDO: as páginas dele já lidas deixam de contar (a leitura recomeça nas metades). */
export function comandoDividirPeriodo(db: Db, loteId: number, periodo: Periodo) {
  return db
    .update(centiLotePassos)
    .set({ estado: "dividido" })
    .where(and(eq(centiLotePassos.loteId, loteId), eq(centiLotePassos.inicio, periodo.inicio), eq(centiLotePassos.fim, periodo.fim), eq(centiLotePassos.estado, "ok")));
}

/**
 * RECONTA o lote pelos passos lidos (os divididos não contam): páginas, recebidos, recusados, os únicos do staging e o
 * TOTAL informado = a soma do total de cada período (desconhecido enquanto algum período lido não tiver o total).
 */
export function comandoRecontarLote(db: Db, loteId: number) {
  const ok = sql`${centiLotePassos.loteId} = ${loteId} AND ${centiLotePassos.estado} = 'ok'`;
  return db
    .update(centiLotes)
    .set({
      paginas: sql`(SELECT COUNT(*) FROM ${centiLotePassos} WHERE ${ok})`,
      recebidos: sql`(SELECT COALESCE(SUM(${centiLotePassos.recebidos}), 0) FROM ${centiLotePassos} WHERE ${ok})`,
      recusados: sql`(SELECT COALESCE(SUM(${centiLotePassos.recusados}), 0) FROM ${centiLotePassos} WHERE ${ok})`,
      unicos: sql`(SELECT COUNT(*) FROM ${empenhosStaging} WHERE ${empenhosStaging.loteId} = ${loteId})`,
      totalInformado: sql`(SELECT CASE WHEN COUNT(t) = COUNT(*) THEN SUM(t) END FROM (SELECT MAX(${centiLotePassos.total}) AS t FROM ${centiLotePassos} WHERE ${ok} GROUP BY ${centiLotePassos.inicio}, ${centiLotePassos.fim}))`,
      vistoEm: sql`CURRENT_TIMESTAMP`,
    })
    .where(and(eq(centiLotes.id, loteId), eq(centiLotes.estado, "lendo")));
}

/** O que o período já leu (as páginas lidas e os registros) — para decidir se continua. */
export async function lidoNoPeriodo(db: Db, loteId: number, periodo: Periodo) {
  const [r] = await db
    .select({ paginas: count(), recebidos: sql<number>`COALESCE(SUM(${centiLotePassos.recebidos}), 0)`, total: sql<number | null>`MAX(${centiLotePassos.total})` })
    .from(centiLotePassos)
    .where(and(eq(centiLotePassos.loteId, loteId), eq(centiLotePassos.inicio, periodo.inicio), eq(centiLotePassos.fim, periodo.fim), eq(centiLotePassos.estado, "ok")));
  return { paginas: r?.paginas ?? 0, recebidos: Number(r?.recebidos ?? 0), total: r?.total == null ? null : Number(r.total) };
}

/** Quantas destas chaves o lote JÁ tem no staging (os "novos" de uma página = as que faltavam). Um parâmetro só. */
export async function jaNoLote(db: Db, loteId: number, chaves: string[]): Promise<number> {
  if (!chaves.length) return 0;
  const [r] = await db
    .select({ n: count() })
    .from(empenhosStaging)
    .where(and(eq(empenhosStaging.loteId, loteId), sql`${empenhosStaging.chave} IN (SELECT value FROM json_each(${JSON.stringify(chaves)}))`));
  return r?.n ?? 0;
}

/** Quantos empenhos o lote cria, atualiza e marca como removidos (antes de promover — o resumo do lote). */
export async function contagemDaPromocao(db: Db, loteId: number, ano: number) {
  const [novos] = await db
    .select({ n: count() })
    .from(empenhosStaging)
    .where(and(eq(empenhosStaging.loteId, loteId), sql`NOT EXISTS (SELECT 1 FROM ${empenhos} WHERE ${empenhos.chave} = ${empenhosStaging.chave})`));
  const [todos] = await db.select({ n: count() }).from(empenhosStaging).where(eq(empenhosStaging.loteId, loteId));
  const [removidos] = await db
    .select({ n: count() })
    .from(empenhos)
    .where(and(eq(empenhos.ano, ano), isNull(empenhos.removidoEm), notInArray(empenhos.chave, db.select({ c: empenhosStaging.chave }).from(empenhosStaging).where(eq(empenhosStaging.loteId, loteId)))));
  return { inseridos: novos.n, atualizados: todos.n - novos.n, removidos: removidos.n };
}

/**
 * PROMOVE o lote conferido, num lote ATÔMICO: grava/atualiza os empenhos (o que reaparece perde o `removido_em`), marca
 * `removido_em` no que o ano tinha e a Centi não trouxe mais (nada é apagado), fecha o lote e limpa o staging.
 */
export function comandosPromover(db: Db, loteId: number, ano: number, contagem: { inseridos: number; atualizados: number; removidos: number }) {
  const sel = db
    .select({
      id: sql<number>`NULL`.as("id"),
      ...Object.fromEntries(CAMPOS.map((c) => [c, empenhosStaging[c]])),
      loteId: empenhosStaging.loteId,
      removidoEm: sql<string | null>`NULL`.as("removido_em"),
      criadoEm: sql<string>`CURRENT_TIMESTAMP`.as("criado_em"),
      atualizadoEm: sql<string>`CURRENT_TIMESTAMP`.as("atualizado_em"),
    })
    .from(empenhosStaging)
    .where(eq(empenhosStaging.loteId, loteId));
  const atualizar = Object.fromEntries(
    [...CAMPOS.filter((c) => c !== "chave"), "loteId", "removidoEm"].map((c) => [c, sql.raw(`excluded.${colunaSql(c)}`)]),
  );
  return [
    db
      .insert(empenhos)
      .select(sel as never)
      .onConflictDoUpdate({ target: empenhos.chave, set: { ...atualizar, atualizadoEm: sql`CURRENT_TIMESTAMP` } }),
    db
      .update(empenhos)
      .set({ removidoEm: sql`CURRENT_TIMESTAMP`, atualizadoEm: sql`CURRENT_TIMESTAMP` })
      .where(
        and(eq(empenhos.ano, ano), isNull(empenhos.removidoEm), notInArray(empenhos.chave, db.select({ c: empenhosStaging.chave }).from(empenhosStaging).where(eq(empenhosStaging.loteId, loteId)))),
      ),
    db
      .update(centiLotes)
      .set({ estado: "promovido", ...contagem, mensagem: null, concluidoEm: sql`CURRENT_TIMESTAMP`, vistoEm: sql`CURRENT_TIMESTAMP` })
      .where(eq(centiLotes.id, loteId)),
    db.delete(empenhosStaging).where(eq(empenhosStaging.loteId, loteId)),
  ] as const;
}

/** Fecha o lote sem promover (parcial, falhou ou cancelado) e limpa o staging — a tabela final não muda. */
export function comandosFecharLote(db: Db, loteId: number, estado: "parcial" | "falhou" | "cancelado", mensagem: string) {
  return [
    db.update(centiLotes).set({ estado, mensagem, concluidoEm: sql`CURRENT_TIMESTAMP`, vistoEm: sql`CURRENT_TIMESTAMP` }).where(eq(centiLotes.id, loteId)),
    db.delete(empenhosStaging).where(eq(empenhosStaging.loteId, loteId)),
  ] as const;
}

/** A coluna SQL de um campo (camelCase → snake_case). */
function colunaSql(c: string): string {
  return c.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}
