import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { notificacoes, preferenciasTabela, usuarios } from "../db/schema.ts";
import { CHAVE_PREF_EMAIL } from "./email-core.ts";

type Db = DrizzleD1Database<typeof schema>;

/** Depois de tantas falhas, o e-mail daquela notificação desiste (o aviso segue no sino). */
export const MAX_TENTATIVAS_EMAIL = 3;
/** Só notificações recentes viram e-mail (nada de mandar aviso velho depois de um tempo sem o Resend). */
const JANELA_EMAIL = "-2 days";
/** A RESERVA vale tanto: o envio não confirmado nesse tempo (o Worker caiu no meio) volta à fila. */
const VALIDADE_RESERVA = "-10 minutes";
const livre = sql`(${notificacoes.emailReservadoEm} IS NULL OR ${notificacoes.emailReservadoEm} < datetime('now', ${VALIDADE_RESERVA}))`;

/**
 * As notificações cujo E-MAIL está PENDENTE (as mais antigas primeiro), com o destinatário (e-mail, status) e a
 * conta Google vinculada (destino opcional dos avisos) e a preferência de e-mail dele (JSON cru — `lerPrefsEmail` interpreta; NULL = padrão).
 */
export function consultaPendentesEmail(db: Db, limite: number) {
  return db
    .select({
      id: notificacoes.id,
      tipo: notificacoes.tipo,
      titulo: notificacoes.titulo,
      texto: notificacoes.texto,
      link: notificacoes.link,
      atorNome: notificacoes.atorNome,
      email: usuarios.email,
      googleEmail: usuarios.googleEmail,
      status: usuarios.status,
      prefs: preferenciasTabela.valor,
    })
    .from(notificacoes)
    .innerJoin(usuarios, eq(usuarios.id, notificacoes.usuarioId))
    .leftJoin(preferenciasTabela, and(eq(preferenciasTabela.usuarioId, notificacoes.usuarioId), eq(preferenciasTabela.chave, CHAVE_PREF_EMAIL)))
    .where(
      and(
        isNull(notificacoes.emailEnviadoEm),
        lt(notificacoes.emailTentativas, MAX_TENTATIVAS_EMAIL),
        sql`${notificacoes.criadoEm} >= datetime('now', ${JANELA_EMAIL})`,
        livre,
        // O aviso de quadro PRIVADO de outra pessoa (a tarefa foi para lá) não sai por e-mail.
        sql`(${notificacoes.quadroId} IS NULL OR EXISTS (SELECT 1 FROM tarefa_quadros q WHERE q.id = ${notificacoes.quadroId} AND (q.privado = 0 OR q.criado_por = ${notificacoes.usuarioId})))`,
      ),
    )
    .orderBy(asc(notificacoes.id))
    .limit(limite);
}

/**
 * RESERVA os e-mails (compare-and-set): marca a RESERVA só dos que ainda estão livres e devolve quais — duas passadas ao
 * mesmo tempo (a da ação e a do cron) nunca mandam o mesmo e-mail duas vezes. A reserva VENCE (10 min): se o envio não
 * for confirmado, o e-mail volta à fila — nada se perde. ≤ 90 ids por chamada.
 */
export function comandoReservarEmails(db: Db, ids: number[]) {
  return db
    .update(notificacoes)
    .set({ emailReservadoEm: sql`CURRENT_TIMESTAMP` })
    .where(and(inArray(notificacoes.id, ids), isNull(notificacoes.emailEnviadoEm), livre))
    .returning({ id: notificacoes.id });
}

/** O envio foi CONFIRMADO (ou o e-mail foi pulado — a pessoa não quer): TRATADO de vez. ≤ 90 ids por chamada. */
export function comandoConfirmarEmails(db: Db, ids: number[]) {
  return db.update(notificacoes).set({ emailEnviadoEm: sql`CURRENT_TIMESTAMP`, emailReservadoEm: null }).where(inArray(notificacoes.id, ids));
}

/** O envio FALHOU: volta a pendente com uma tentativa a mais. ≤ 90 ids por chamada. */
export function comandoDevolverEmails(db: Db, ids: number[]) {
  return db
    .update(notificacoes)
    .set({ emailReservadoEm: null, emailTentativas: sql`${notificacoes.emailTentativas} + 1` })
    .where(inArray(notificacoes.id, ids));
}

/** HIGIENE da fila: o que desistiu (3 tentativas) ou ficou velho demais passa a TRATADO — a fila só tem o que vale. */
export function comandoEncerrarEmailsVelhos(db: Db) {
  return db
    .update(notificacoes)
    .set({ emailEnviadoEm: sql`CURRENT_TIMESTAMP`, emailReservadoEm: null })
    .where(
      and(
        isNull(notificacoes.emailEnviadoEm),
        sql`(${notificacoes.emailTentativas} >= ${MAX_TENTATIVAS_EMAIL} OR ${notificacoes.criadoEm} < datetime('now', ${JANELA_EMAIL}))`,
      ),
    );
}
