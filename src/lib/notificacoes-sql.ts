import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { notificacoes, notificacoesDispensadas } from "../db/schema.ts";
import type { Retencao } from "./notificacoes-config-core.ts";

/**
 * BUILDERS das notificações (migração `0083`) — a LIMPEZA de verdade (apaga do banco) e a retenção, prontos para o
 * `db.batch` (só builders: o comando cru com parâmetros quebra no lote do D1). Testados no driver D1 real.
 */

type Db = DrizzleD1Database<typeof schema>;

/** Quanto vale a DISPENSA de um aviso derivado (maior que a janela da derivação — 30 dias atrás). */
export const DIAS_DISPENSA = 40;

export type AlvoLimpeza = { ids: number[] } | { limpar: "lidas" | "todas" };

const daPessoa = (usuarioId: number, alvo: AlvoLimpeza) =>
  and(
    eq(notificacoes.usuarioId, usuarioId),
    "ids" in alvo ? inArray(notificacoes.id, alvo.ids.slice(0, 90)) : alvo.limpar === "lidas" ? eq(notificacoes.lida, true) : undefined,
  );

/**
 * EXCLUI do banco os avisos da pessoa (os pedidos, as lidas ou todos). Os DERIVADOS (com chave — prazo, lembrete)
 * ficam DISPENSADOS no MESMO lote: a próxima derivação não os recria.
 */
export function comandosExcluirNotificacoes(db: Db, usuarioId: number, alvo: AlvoLimpeza) {
  return [
    db
      .insert(notificacoesDispensadas)
      .select(
        db
          .select({ usuarioId: notificacoes.usuarioId, chave: sql<string>`${notificacoes.chave}`.as("chave"), ate: sql<string>`date('now', ${`+${DIAS_DISPENSA} days`})`.as("ate") })
          .from(notificacoes)
          .where(and(daPessoa(usuarioId, alvo), isNotNull(notificacoes.chave))),
      )
      .onConflictDoNothing(),
    db.delete(notificacoes).where(daPessoa(usuarioId, alvo)).returning({ id: notificacoes.id }),
  ] as const;
}

/**
 * A RETENÇÃO (o cron, com a limpeza automática ligada, e o "Limpar agora" do ADM): as lidas depois de `lidasDias`, as não
 * lidas depois de `naoLidasDias`, o excedente do `teto` por pessoa (as lidas mais antigas saem antes) e as dispensas
 * vencidas. Devolve quantas saíram em cada passo.
 */
export function comandosRetencaoNotificacoes(db: Db, r: Retencao) {
  return [
    db
      .delete(notificacoes)
      .where(and(eq(notificacoes.lida, true), sql`${notificacoes.criadoEm} < datetime('now', ${`-${r.lidasDias} days`})`))
      .returning({ id: notificacoes.id }),
    db
      .delete(notificacoes)
      .where(sql`${notificacoes.criadoEm} < datetime('now', ${`-${r.naoLidasDias} days`})`)
      .returning({ id: notificacoes.id }),
    db
      .delete(notificacoes)
      .where(sql`${notificacoes.id} IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY usuario_id ORDER BY lida, id DESC) AS rn FROM notificacoes) WHERE rn > ${r.teto})`)
      .returning({ id: notificacoes.id }),
    db.delete(notificacoesDispensadas).where(lt(notificacoesDispensadas.ate, sql`date('now')`)),
  ] as const;
}

/** As chaves DISPENSADAS da pessoa (a derivação não as recria). */
export function consultaDispensadas(db: Db, usuarioId: number) {
  return db.select({ chave: notificacoesDispensadas.chave }).from(notificacoesDispensadas).where(eq(notificacoesDispensadas.usuarioId, usuarioId));
}
