import { and, eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { termosAceites, termosPendencias, termosUso, usuarios } from "../db/schema.ts";

// TERMO DE USO — os comandos (testados no driver D1 real — tests/termo-aparelhos.test.ts).

type Db = DrizzleD1Database<typeof schema>;

/** Quem precisa aceitar: todos os ativos, ou as pessoas escolhidas (os ids num parâmetro JSON — sem teto de parâmetros). */
export type PublicoTermo = { todos: true } | { ids: number[] };

/**
 * As PENDÊNCIAS de uma versão: as pessoas do público que ainda NÃO aceitaram a versão (oficialmente). `soTestadores` =
 * no modo teste, só os testadores entram. Quem já tinha a pendência fica com o prazo NOVO.
 */
export function comandoPendencias(db: Db, termoId: number, publico: PublicoTermo, prazo: string) {
  const doPublico = "todos" in publico ? sql`1` : sql`${usuarios.id} IN (SELECT value FROM json_each(${JSON.stringify(publico.ids)}))`;
  const linha = db
    .select({ usuarioId: usuarios.id, termoId: sql<number>`${termoId}`.as("termo_id"), prazo: sql<string>`${prazo}`.as("prazo") })
    .from(usuarios)
    .where(
      and(
        eq(usuarios.status, "ativo"),
        doPublico,
        sql`NOT EXISTS (SELECT 1 FROM ${termosAceites} AS ta WHERE ta.usuario_id = ${usuarios.id} AND ta.termo_id = ${termoId} AND ta.teste = 0)`,
      ),
    );
  return db.insert(termosPendencias).select(linha).onConflictDoUpdate({ target: [termosPendencias.usuarioId, termosPendencias.termoId], set: { prazo } });
}

/** PUBLICAR o rascunho (só se ainda é rascunho — dois cliques nunca publicam duas vezes). */
export function comandoPublicar(db: Db, id: number, d: { textoFinal: string; hash: string; clausulas: string; em: string; por: string }) {
  return db
    .update(termosUso)
    .set({ estado: "publicado", textoFinal: d.textoFinal, hash: d.hash, clausulasAuto: d.clausulas, publicadoEm: d.em, publicadoPor: d.por, atualizadoEm: d.em })
    .where(and(eq(termosUso.id, id), eq(termosUso.estado, "rascunho")))
    .returning({ id: termosUso.id });
}

export type NovoAceite = typeof termosAceites.$inferInsert;

/** ACEITAR: (no teste, o aceite de teste anterior da mesma versão sai) grava o aceite e tira a pendência — num lote. */
export function comandosAceitar(db: Db, a: NovoAceite & { usuarioId: number }) {
  const cmds = [
    db
      .delete(termosAceites)
      .where(and(eq(termosAceites.usuarioId, a.usuarioId), eq(termosAceites.termoId, a.termoId), eq(termosAceites.teste, true))),
    db.insert(termosAceites).values(a).onConflictDoNothing().returning({ id: termosAceites.id }),
    db.delete(termosPendencias).where(and(eq(termosPendencias.usuarioId, a.usuarioId), eq(termosPendencias.termoId, a.termoId))),
  ] as const;
  return cmds;
}

/** O teste com "repetir a cada login": a pendência volta (vale já). */
export function comandoPendenciaJa(db: Db, usuarioId: number, termoId: number, agora: string) {
  return db
    .insert(termosPendencias)
    .values({ usuarioId, termoId, prazo: agora })
    .onConflictDoUpdate({ target: [termosPendencias.usuarioId, termosPendencias.termoId], set: { prazo: agora } });
}

/** Passar do TESTE para o ATIVO: os aceites de teste e as pendências do teste saem (todos aceitam a versão oficial). */
export function comandosLimparTesteTermo(db: Db) {
  return [db.delete(termosAceites).where(eq(termosAceites.teste, true)), db.delete(termosPendencias)] as const;
}

/** A versão PUBLICADA mais recente. */
export function consultaTermoVigente(db: Db) {
  return db.select().from(termosUso).where(eq(termosUso.estado, "publicado")).orderBy(sql`${termosUso.versao} DESC`).limit(1);
}
