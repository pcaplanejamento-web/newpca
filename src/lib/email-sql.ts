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
      ),
    )
    .orderBy(asc(notificacoes.id))
    .limit(limite);
}

/**
 * RESERVA os e-mails (compare-and-set): marca como tratados SÓ os que ainda estão pendentes e devolve quais — duas
 * passadas ao mesmo tempo (a da ação e a do cron) nunca mandam o mesmo e-mail duas vezes. ≤ 90 ids por chamada.
 */
export function comandoReservarEmails(db: Db, ids: number[]) {
  return db
    .update(notificacoes)
    .set({ emailEnviadoEm: sql`CURRENT_TIMESTAMP` })
    .where(and(inArray(notificacoes.id, ids), isNull(notificacoes.emailEnviadoEm)))
    .returning({ id: notificacoes.id });
}

/** O envio FALHOU: volta a pendente com uma tentativa a mais. ≤ 90 ids por chamada. */
export function comandoDevolverEmails(db: Db, ids: number[]) {
  return db
    .update(notificacoes)
    .set({ emailEnviadoEm: null, emailTentativas: sql`${notificacoes.emailTentativas} + 1` })
    .where(inArray(notificacoes.id, ids));
}
