import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { aparelhos, aparelhosConta, sessoes, usuarios } from "../db/schema.ts";

// APARELHOS DA CONTA — os comandos com a TRAVA no próprio SQL (testados no driver D1 real — tests/termo-aparelhos.test.ts).

type Db = DrizzleD1Database<typeof schema>;

export type NovoAparelho = { usuarioId: number; hash: string; nome: string; navegador: string; ip: string; em: string; teste: boolean; limite: number };

const totalDe = (usuarioId: number) => sql`(SELECT COUNT(*) FROM ${aparelhos} AS a2 WHERE a2.usuario_id = ${usuarioId})`;

/** O aparelho NOVO entra só se houver vaga (contada NO COMANDO — duas abas ao mesmo tempo nunca passam do limite). */
function inserirComVaga(db: Db, a: NovoAparelho, removidos = 0) {
  const linha = db
    .select({
      id: sql<number>`NULL`.as("id"),
      usuarioId: usuarios.id,
      hash: sql<string>`${a.hash}`.as("hash"),
      nome: sql<string>`${a.nome}`.as("nome"),
      navegador: sql<string>`${a.navegador}`.as("navegador"),
      ip: sql<string>`${a.ip}`.as("ip"),
      criadoEm: sql<string>`${a.em}`.as("criado_em"),
      vistoEm: sql<string>`${a.em}`.as("visto_em"),
      teste: sql<boolean>`${a.teste ? 1 : 0}`.as("teste"),
    })
    .from(usuarios)
    .where(
      and(
        eq(usuarios.id, a.usuarioId),
        sql`${totalDe(a.usuarioId)} - ${removidos} < ${a.limite}`,
        sql`NOT EXISTS (SELECT 1 FROM ${aparelhos} AS a3 WHERE a3.usuario_id = ${a.usuarioId} AND a3.hash = ${a.hash})`,
      ),
    );
  return db.insert(aparelhos).select(linha).returning({ id: aparelhos.id });
}

/** Liga a sessão ao aparelho de mesmo hash (nulo se ele não entrou). */
function ligarSessao(db: Db, sessaoId: number, usuarioId: number, hash: string) {
  return db
    .update(sessoes)
    .set({ aparelhoId: sql`(SELECT a4.id FROM ${aparelhos} AS a4 WHERE a4.usuario_id = ${usuarioId} AND a4.hash = ${hash})` })
    .where(and(eq(sessoes.id, sessaoId), eq(sessoes.usuarioId, usuarioId)));
}

/** NOMEAR um aparelho novo (com vaga) e ligar a sessão — num lote. O 1º devolve o id (vazio = sem vaga). */
export function comandosNomearAparelho(db: Db, a: NovoAparelho, sessaoId: number) {
  return [inserirComVaga(db, a), ligarSessao(db, sessaoId, a.usuarioId, a.hash)] as const;
}

/** O aparelho JÁ CONHECIDO (mesmo hash): renomeia (opcional) e liga a sessão. */
export function comandosLigarConhecido(db: Db, usuarioId: number, hash: string, sessaoId: number, nome: string | null, em: string) {
  const set: Partial<typeof aparelhos.$inferInsert> = { vistoEm: em };
  if (nome) set.nome = nome;
  return [db.update(aparelhos).set(set).where(and(eq(aparelhos.usuarioId, usuarioId), eq(aparelhos.hash, hash))), ligarSessao(db, sessaoId, usuarioId, hash)] as const;
}

/**
 * TROCA atômica (a conta lotada): encerra as sessões dos aparelhos retirados, retira-os, registra o novo, liga a sessão e
 * inicia a trava — TUDO só se a retirada abre a vaga (senão nada acontece: ninguém fica sem aparelho). O aparelho da
 * PRÓPRIA sessão nunca é retirado. A trava (`trocaAte`) só é gravada quando o novo entrou.
 */
export function comandosTrocarAparelho(db: Db, a: NovoAparelho, sessaoId: number, removerIds: number[], trocaAte: string | null) {
  const ids = removerIds.length ? removerIds : [0];
  const n = removerIds.length;
  const abre = sql`(SELECT COUNT(*) FROM ${aparelhos} AS a5 WHERE a5.usuario_id = ${a.usuarioId} AND a5.id IN ${ids}) = ${n} AND ${totalDe(a.usuarioId)} - ${n} < ${a.limite} AND NOT EXISTS (SELECT 1 FROM ${aparelhos} AS a6 WHERE a6.usuario_id = ${a.usuarioId} AND a6.hash = ${a.hash})`;
  const daSessao = sql`COALESCE((SELECT s2.aparelho_id FROM ${sessoes} AS s2 WHERE s2.id = ${sessaoId}), 0)`;
  const encerrar = db
    .delete(sessoes)
    .where(and(eq(sessoes.usuarioId, a.usuarioId), inArray(sessoes.aparelhoId, ids), ne(sessoes.id, sessaoId), abre, sql`${daSessao} NOT IN ${ids}`));
  const retirar = db
    .delete(aparelhos)
    .where(and(eq(aparelhos.usuarioId, a.usuarioId), inArray(aparelhos.id, ids), sql`${daSessao} NOT IN ${ids}`, abre));
  const cmds = [encerrar, retirar, inserirComVaga(db, a), ligarSessao(db, sessaoId, a.usuarioId, a.hash)] as const;
  if (!trocaAte) return cmds;
  const trava = db
    .insert(aparelhosConta)
    .select(
      db
        .select({ usuarioId: aparelhos.usuarioId, limite: sql<number | null>`NULL`.as("limite"), trocaAte: sql<string>`${trocaAte}`.as("troca_ate") })
        .from(aparelhos)
        .where(and(eq(aparelhos.usuarioId, a.usuarioId), eq(aparelhos.hash, a.hash))),
    )
    .onConflictDoUpdate({ target: aparelhosConta.usuarioId, set: { trocaAte } });
  return [...cmds, trava] as const;
}

/** RETIRAR aparelhos (pela pessoa — nunca o da própria sessão — ou pelo ADM): encerra as sessões deles e os apaga. */
export function comandosRetirarAparelhos(db: Db, usuarioId: number, ids: number[], manterAparelhoId: number | null) {
  const alvo = manterAparelhoId != null ? ids.filter((i) => i !== manterAparelhoId) : ids;
  const lista = alvo.length ? alvo : [0];
  return [
    db.delete(sessoes).where(and(eq(sessoes.usuarioId, usuarioId), inArray(sessoes.aparelhoId, lista))),
    db.delete(aparelhos).where(and(eq(aparelhos.usuarioId, usuarioId), inArray(aparelhos.id, lista))).returning({ id: aparelhos.id }),
  ] as const;
}

export function comandoRenomearAparelho(db: Db, usuarioId: number, id: number, nome: string) {
  return db.update(aparelhos).set({ nome }).where(and(eq(aparelhos.usuarioId, usuarioId), eq(aparelhos.id, id))).returning({ id: aparelhos.id });
}

/** O limite PRÓPRIO (null = volta ao do papel/padrão) e/ou liberar a troca (zera a trava). */
export function comandoContaAparelhos(db: Db, usuarioId: number, d: { limite?: number | null; liberarTroca?: boolean }) {
  const set: { limite?: number | null; trocaAte?: null } = {};
  if (d.limite !== undefined) set.limite = d.limite;
  if (d.liberarTroca) set.trocaAte = null;
  return db
    .insert(aparelhosConta)
    .values({ usuarioId, limite: d.limite ?? null, trocaAte: null })
    .onConflictDoUpdate({ target: aparelhosConta.usuarioId, set });
}

/** EXIGIR NOVO CADASTRO (ADM): apaga os aparelhos das pessoas (`null` = de todos) — as sessões ficam, sem aparelho, e
 * a pessoa nomeia o aparelho de novo no próximo pedido. A trava da troca também sai. */
export function comandosRefazerAparelhos(db: Db, usuarioIds: number[] | null) {
  if (usuarioIds === null) return [db.delete(aparelhos).returning({ u: aparelhos.usuarioId }), db.update(aparelhosConta).set({ trocaAte: null })] as const;
  const alvo = sql`(SELECT value FROM json_each(${JSON.stringify(usuarioIds)}))`;
  return [
    db.delete(aparelhos).where(sql`${aparelhos.usuarioId} IN ${alvo}`).returning({ u: aparelhos.usuarioId }),
    db.update(aparelhosConta).set({ trocaAte: null }).where(sql`${aparelhosConta.usuarioId} IN ${alvo}`),
  ] as const;
}

/** Passar do TESTE para o ATIVO: os aparelhos de teste saem (todos nomeiam do zero). */
export function comandosLimparTesteAparelhos(db: Db) {
  return [db.delete(aparelhos).where(eq(aparelhos.teste, true)), db.update(aparelhosConta).set({ trocaAte: null })] as const;
}

export function consultaAparelhos(db: Db, usuarioId: number) {
  return db
    .select({ id: aparelhos.id, nome: aparelhos.nome, navegador: aparelhos.navegador, ip: aparelhos.ip, criadoEm: aparelhos.criadoEm, vistoEm: aparelhos.vistoEm, teste: aparelhos.teste })
    .from(aparelhos)
    .where(eq(aparelhos.usuarioId, usuarioId))
    .orderBy(sql`COALESCE(${aparelhos.vistoEm}, ${aparelhos.criadoEm}) DESC`);
}
