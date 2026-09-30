import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { dfdProtocolos, dfds } from "../db/schema.ts";

/**
 * "SÓ OS MEUS" — as LINHAS da Mesa de quem tem o detalhe `linhas: "meus"` no papel. Um protocolo é MEU quando sou o
 * RESPONSÁVEL ou quando fui eu que PROTOCOLEI (`criado_por` — a Distribuição); um DFD é meu quando o protocolo dele é meu,
 * ou — AVULSO (sem protocolo) — quando fui eu que o criei; o item segue o DFD. BUILDERS do Drizzle (sem getDb; testados
 * pelo driver D1 real): subconsultas, nunca listas de IN — cabem no limite de parâmetros do D1 com qualquer volume.
 */
type Db = DrizzleD1Database<typeof schema>;

/** A condição "meu" do protocolo. */
export const condMeuProtocolo = (usuarioId: number) => or(eq(dfdProtocolos.responsavelId, usuarioId), eq(dfdProtocolos.criadoPor, usuarioId));

/** Os ids dos protocolos MEUS. */
export function consultaMeusProtocolos(db: Db, usuarioId: number) {
  return db.select({ id: dfdProtocolos.id }).from(dfdProtocolos).where(condMeuProtocolo(usuarioId));
}

/** A condição "meu" do DFD (de um protocolo meu, ou avulso criado por mim). */
export function condMeuDfd(db: Db, usuarioId: number) {
  return or(
    inArray(dfds.protocoloId, db.select({ id: dfdProtocolos.id }).from(dfdProtocolos).where(condMeuProtocolo(usuarioId))),
    and(isNull(dfds.protocoloId), eq(dfds.criadoPor, usuarioId)),
  );
}

/** Os ids dos DFDs MEUS. */
export function consultaMeusDfds(db: Db, usuarioId: number) {
  return db.select({ id: dfds.id }).from(dfds).where(condMeuDfd(db, usuarioId));
}
