import { and, eq, gt, lte, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { automacaoAutorizacoes, automacaoExecucoes, automacaoPassos, automacaoRegistros } from "../db/schema.ts";

/**
 * AUTOMAÇÃO — os comandos como BUILDERS do Drizzle (sem getDb: testados pelo driver D1 REAL sobre `node:sqlite`).
 * A autorização é CONSUMIDA por DELETE … RETURNING (vale UMA vez, mesmo com dois pedidos simultâneos) e o registro da
 * escrita é um INSERT que não faz nada em conflito (o mesmo alvo + descrição nunca é gravado duas vezes).
 */
type Db = DrizzleD1Database<typeof schema>;

/** Linhas por INSERT dos passos: 6 parâmetros por linha (o estado padrão entra) × 16 = 96 (< 100 do D1). */
export const LOTE_PASSOS = 16;

export type PassoNovo = { chave: string; capacidade: string; alvo: string | null };

/** Os passos de uma execução, na ordem, em INSERTs de ≤ 96 parâmetros. */
export function comandosPassos(db: Db, execucaoId: number, passos: readonly PassoNovo[]) {
  const out = [];
  for (let i = 0; i < passos.length; i += LOTE_PASSOS)
    out.push(
      db.insert(automacaoPassos).values(
        passos.slice(i, i + LOTE_PASSOS).map((p, j) => ({ execucaoId, ordem: i + j, chave: p.chave, capacidade: p.capacidade, alvo: p.alvo })),
      ),
    );
  return out;
}

/** O resultado de UM passo (início/fim pelo estado). */
export function comandoAtualizarPasso(
  db: Db,
  execucaoId: number,
  chave: string,
  p: { estado: string; resultado?: string | null; erro?: string | null },
) {
  const inicio = p.estado === "executando" ? sql`CURRENT_TIMESTAMP` : sql`${automacaoPassos.inicio}`;
  const fim = p.estado === "ok" || p.estado === "falhou" || p.estado === "pulado" ? sql`CURRENT_TIMESTAMP` : sql`NULL`;
  return db
    .update(automacaoPassos)
    .set({ estado: p.estado, resultado: p.resultado ?? null, erro: p.erro ?? null, inicio, fim })
    .where(and(eq(automacaoPassos.execucaoId, execucaoId), eq(automacaoPassos.chave, chave)));
}

/** Os totais da execução recontados NO BANCO (nunca desalinham com os passos). */
export function comandoRecontar(db: Db, execucaoId: number) {
  const conta = (estado: string) =>
    sql<number>`(SELECT COUNT(*) FROM ${automacaoPassos} WHERE ${automacaoPassos.execucaoId} = ${execucaoId} AND ${automacaoPassos.estado} = ${estado})`;
  return db
    .update(automacaoExecucoes)
    .set({
      total: sql`(SELECT COUNT(*) FROM ${automacaoPassos} WHERE ${automacaoPassos.execucaoId} = ${execucaoId})`,
      feitos: conta("ok"),
      falhas: conta("falhou"),
      atualizadoEm: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(automacaoExecucoes.id, execucaoId));
}

/** Cria a autorização de uso único (só o HASH do token). */
export function comandoCriarAutorizacao(
  db: Db,
  a: { idHash: string; execucaoId: number; passoChave: string; capacidade: string; alvoHash: string; usuarioId: number; expiraEm: number },
) {
  return db.insert(automacaoAutorizacoes).values({
    id: a.idHash,
    execucaoId: a.execucaoId,
    passoChave: a.passoChave,
    capacidade: a.capacidade,
    alvoHash: a.alvoHash,
    usuarioId: a.usuarioId,
    expiraEm: a.expiraEm,
  });
}

/** CONSOME a autorização (vale uma vez, só de quem a pediu e dentro da validade). */
export function comandoConsumirAutorizacao(db: Db, idHash: string, usuarioId: number, agoraS: number) {
  return db
    .delete(automacaoAutorizacoes)
    .where(and(eq(automacaoAutorizacoes.id, idHash), eq(automacaoAutorizacoes.usuarioId, usuarioId), gt(automacaoAutorizacoes.expiraEm, agoraS)))
    .returning({
      execucaoId: automacaoAutorizacoes.execucaoId,
      passoChave: automacaoAutorizacoes.passoChave,
      capacidade: automacaoAutorizacoes.capacidade,
      alvoHash: automacaoAutorizacoes.alvoHash,
    });
}

/** Higiene: as autorizações vencidas. */
export function comandoLimparAutorizacoes(db: Db, agoraS: number) {
  return db.delete(automacaoAutorizacoes).where(lte(automacaoAutorizacoes.expiraEm, agoraS));
}

/** Registra UMA escrita na Centi — repetida (mesmo alvo + descrição) não faz nada e devolve vazio. */
export function comandoRegistrarEscrita(
  db: Db,
  r: {
    capacidade: string;
    centiAlvo: string;
    descricao: string;
    centiDocumento: string | null;
    protocoloId: number | null;
    execucaoId: number | null;
    usuarioId: number;
    usuarioNome: string;
  },
) {
  return db.insert(automacaoRegistros).values(r).onConflictDoNothing().returning({ id: automacaoRegistros.id });
}
