import { and, eq, isNull, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { declaracaoItens, declaracoes } from "../db/schema.ts";

type Db = DrizzleD1Database<typeof schema>;

/** 5 colunas + o id da declaração por linha → ≤ 100 parâmetros por INSERT. */
const LOTE_ITENS = 14;

export type NovaDeclaracaoSql = {
  pcaId: number;
  ano: number;
  numero: number;
  codigo: string;
  finalidade: string;
  processo: string | null;
  protocoloCenti: string | null;
  observacao: string | null;
  conteudo: string;
  selo: string;
  totalItens: number;
  valorTotal: number;
  emitidoPor: number | null;
  emitidoPorNome: string;
  emitidoEm: string;
  itens: { sequencial: number; quantidade: number; quantidadePca: number }[];
};

/**
 * A EMISSÃO num lote ATÔMICO: a declaração + os itens (o id pelo código, no mesmo lote). O gatilho
 * `declaracao_itens_saldo` recusa ("saldo_insuficiente") o item além do saldo — o lote inteiro volta.
 */
export function comandosEmitirDeclaracao(db: Db, d: NovaDeclaracaoSql) {
  const { itens, ...cab } = d;
  const id = sql<number>`(SELECT id FROM declaracoes WHERE codigo = ${d.codigo})`;
  const cmds = [db.insert(declaracoes).values(cab)];
  for (let i = 0; i < itens.length; i += LOTE_ITENS)
    cmds.push(
      db
        .insert(declaracaoItens)
        .values(itens.slice(i, i + LOTE_ITENS).map((l) => ({ declaracaoId: id, pcaId: d.pcaId, ...l }))) as unknown as (typeof cmds)[number],
    );
  return cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]];
}

export type EdicaoDeclaracaoSql = Pick<NovaDeclaracaoSql, "pcaId" | "finalidade" | "processo" | "protocoloCenti" | "observacao" | "conteudo" | "selo" | "totalItens" | "valorTotal" | "itens"> & {
  id: number;
  editadaPorNome: string;
};

/**
 * A EDIÇÃO num lote ATÔMICO: o UPDATE do retrato PRIMEIRO (o gatilho `declaracoes_travada` recusa a exportada/cancelada —
 * o lote inteiro volta), depois os itens trocados (apagados e regravados — o gatilho do saldo confere cada um sem contar os
 * da própria declaração, que já saíram).
 */
export function comandosEditarDeclaracao(db: Db, d: EdicaoDeclaracaoSql) {
  const { itens, id, pcaId, editadaPorNome, ...cab } = d;
  const atualizar = db
    .update(declaracoes)
    .set({ ...cab, editadaEm: sql`CURRENT_TIMESTAMP`, editadaPorNome })
    .where(eq(declaracoes.id, id));
  const resto = [db.delete(declaracaoItens).where(eq(declaracaoItens.declaracaoId, id))] as unknown as (typeof atualizar)[];
  for (let i = 0; i < itens.length; i += LOTE_ITENS)
    resto.push(db.insert(declaracaoItens).values(itens.slice(i, i + LOTE_ITENS).map((l) => ({ declaracaoId: id, pcaId, ...l }))) as unknown as typeof atualizar);
  return [atualizar, ...resto] as [typeof atualizar, ...(typeof atualizar)[]];
}

/** EXPORTA: marca a declaração (só a ainda não exportada e não cancelada — devolve se marcou). Daí em diante, travada. */
export function comandoExportarDeclaracao(db: Db, id: number, quem: string) {
  return db
    .update(declaracoes)
    .set({ exportadaEm: sql`CURRENT_TIMESTAMP`, exportadaPorNome: quem })
    .where(and(eq(declaracoes.id, id), isNull(declaracoes.exportadaEm), isNull(declaracoes.canceladaEm)))
    .returning({ id: declaracoes.id });
}

/** O já declarado de cada item do PCA (as declarações NÃO canceladas), pelo sequencial. */
export function consultaDeclarados(db: Db, pcaId: number) {
  return db
    .select({ sequencial: declaracaoItens.sequencial, total: sql<number>`SUM(${declaracaoItens.quantidade})` })
    .from(declaracaoItens)
    .innerJoin(declaracoes, eq(declaracoes.id, declaracaoItens.declaracaoId))
    .where(and(eq(declaracaoItens.pcaId, pcaId), isNull(declaracoes.canceladaEm)))
    .groupBy(declaracaoItens.sequencial);
}

/** O próximo número do ano. */
export function consultaUltimoNumero(db: Db, ano: number) {
  return db.select({ n: sql<number | null>`MAX(${declaracoes.numero})` }).from(declaracoes).where(eq(declaracoes.ano, ano));
}

/** CANCELA (só a não cancelada — devolve se cancelou). */
export function comandoCancelarDeclaracao(db: Db, id: number, quem: string, motivo: string) {
  return db
    .update(declaracoes)
    .set({ canceladaEm: sql`CURRENT_TIMESTAMP`, canceladaPorNome: quem, motivoCancelamento: motivo })
    .where(and(eq(declaracoes.id, id), isNull(declaracoes.canceladaEm)))
    .returning({ id: declaracoes.id });
}
