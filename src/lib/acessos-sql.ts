import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { DIAS_EVENTOS, MAX_EVENTOS } from "./acessos-core.ts";
import { acessos, eventosProtecao, usuarios } from "../db/schema.ts";

type Db = DrizzleD1Database<typeof schema>;

/** Quantos acessos ficam guardados por pessoa (os mais antigos saem a cada login). */
export const MAX_ACESSOS = 50;

export type NovoAcesso = { usuarioId: number; em: string; canal: string; navegador: string; ip: string | null; aparelho: string; novo: boolean; sessao?: string | null };

/** Um LOGIN: grava o acesso, poda além de `MAX_ACESSOS` e marca o último acesso — num lote atômico. */
export function comandosRegistrarAcesso(db: Db, a: NovoAcesso) {
  return [
    db.insert(acessos).values({ ...a, ultimoEm: a.em }),
    db
      .delete(acessos)
      .where(
        and(
          eq(acessos.usuarioId, a.usuarioId),
          sql`${acessos.id} NOT IN (SELECT a2.id FROM acessos AS a2 WHERE a2.usuario_id = ${a.usuarioId} ORDER BY a2.id DESC LIMIT ${MAX_ACESSOS})`,
        ),
      ),
    db.update(usuarios).set({ ultimoAcessoEm: a.em }).where(eq(usuarios.id, a.usuarioId)),
  ] as const;
}

/** Os acessos de uma pessoa, o mais recente primeiro. */
export function consultaAcessos(db: Db, usuarioId: number) {
  return db
    .select({
      id: acessos.id,
      em: acessos.em,
      canal: acessos.canal,
      navegador: acessos.navegador,
      ip: acessos.ip,
      aparelho: acessos.aparelho,
      novo: acessos.novo,
      ultimoEm: acessos.ultimoEm,
      saidaEm: acessos.saidaEm,
      saidaMotivo: acessos.saidaMotivo,
    })
    .from(acessos)
    .where(eq(acessos.usuarioId, usuarioId))
    .orderBy(desc(acessos.id))
    .limit(MAX_ACESSOS);
}

/** A ATIVIDADE da sessão: o acesso aberto dela anda junto (a saída estimada). */
export function comandoAtividadeAcesso(db: Db, sessao: string, iso: string) {
  return db.update(acessos).set({ ultimoEm: iso }).where(and(eq(acessos.sessao, sessao), isNull(acessos.saidaEm)));
}

/** A SAÍDA das sessões (sair, inatividade, vencida): grava a hora e o motivo no acesso ainda aberto de cada uma. */
export function comandoSaidaAcessos(db: Db, sessoes: readonly string[], iso: string, motivo: string) {
  return db
    .update(acessos)
    .set({ saidaEm: iso, saidaMotivo: motivo })
    .where(and(inArray(acessos.sessao, [...sessoes]), isNull(acessos.saidaEm)));
}

export type NovoEvento = {
  usuarioId: number;
  em: string;
  tipo: string;
  rota: string;
  tela: string;
  itens: string;
  texto: string | null;
  tamanho: number;
  origem: string;
  navegador: string;
  ip: string | null;
};

/** Um evento de CÓPIA/CAPTURA: grava e poda além de `MAX_EVENTOS` por pessoa — num lote. */
export function comandosRegistrarEvento(db: Db, e: NovoEvento) {
  return [
    db.insert(eventosProtecao).values(e),
    db
      .delete(eventosProtecao)
      .where(
        and(
          eq(eventosProtecao.usuarioId, e.usuarioId),
          sql`${eventosProtecao.id} NOT IN (SELECT e2.id FROM eventos_protecao AS e2 WHERE e2.usuario_id = ${e.usuarioId} ORDER BY e2.id DESC LIMIT ${MAX_EVENTOS})`,
        ),
      ),
  ] as const;
}

/** Os eventos de uma pessoa, o mais recente primeiro. */
export function consultaEventos(db: Db, usuarioId: number) {
  return db
    .select({
      id: eventosProtecao.id,
      em: eventosProtecao.em,
      tipo: eventosProtecao.tipo,
      rota: eventosProtecao.rota,
      tela: eventosProtecao.tela,
      itens: eventosProtecao.itens,
      texto: eventosProtecao.texto,
      tamanho: eventosProtecao.tamanho,
      origem: eventosProtecao.origem,
      navegador: eventosProtecao.navegador,
      ip: eventosProtecao.ip,
    })
    .from(eventosProtecao)
    .where(eq(eventosProtecao.usuarioId, usuarioId))
    .orderBy(desc(eventosProtecao.id))
    .limit(MAX_EVENTOS);
}

/** A retenção: os eventos com mais de `DIAS_EVENTOS` dias saem. */
export function comandoLimparEventos(db: Db, agoraMs: number) {
  return db.delete(eventosProtecao).where(lt(eventosProtecao.em, new Date(agoraMs - DIAS_EVENTOS * 86_400_000).toISOString()));
}
