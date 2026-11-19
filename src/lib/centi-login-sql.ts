import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { centiLoginChaves, centiLogins } from "../db/schema.ts";

/**
 * O LOGIN DA CENTI no banco (`centi_logins`, um por pessoa) — os comandos, sem a cifra (o blob já vem pronto de
 * `centi-login-cofre.ts`). Testados no driver D1 real (`tests/centi-login.test.ts`).
 */
type Db = DrizzleD1Database<typeof schema>;

export type LinhaLoginCenti = typeof centiLogins.$inferSelect;

export const consultaLoginCenti = (db: Db, usuarioId: number) => db.select().from(centiLogins).where(eq(centiLogins.usuarioId, usuarioId)).limit(1);

/** Grava (cria ou troca) o login: salvar ZERA a pausa — credenciais conferidas de novo podem ser tentadas. */
export function comandoGuardarLoginCenti(db: Db, usuarioId: number, cifrado: string, auto: boolean, em: string) {
  const v = { cifrado, auto: auto ? 1 : 0, atualizadoEm: em, pausadoEm: null, motivo: null };
  return db
    .insert(centiLogins)
    .values({ usuarioId, ...v })
    .onConflictDoUpdate({ target: centiLogins.usuarioId, set: v });
}

/** Troca só o blob (o formato antigo regravado no novo) — sem mexer na pausa nem na data em que foi salvo. */
export const comandoRecifrarLoginCenti = (db: Db, usuarioId: number, cifrado: string, auto: boolean) =>
  db.update(centiLogins).set({ cifrado, auto: auto ? 1 : 0 }).where(eq(centiLogins.usuarioId, usuarioId));

/** Salvar SEM trocar usuário/senha: o "Entrar sozinho" e o RETOMAR (a pessoa conferiu — ex.: a verificação da Centi
 * já passou), sem regravar a senha. Como todo salvar, zera a pausa. */
export const comandoAutoLoginCenti = (db: Db, usuarioId: number, auto: boolean, em: string) =>
  db.update(centiLogins).set({ auto: auto ? 1 : 0, atualizadoEm: em, pausadoEm: null, motivo: null }).where(eq(centiLogins.usuarioId, usuarioId));

/** A Centi RECUSOU a senha: pausa para todos os navegadores da pessoa até salvar de novo. */
export const comandoPausarLoginCenti = (db: Db, usuarioId: number, motivo: string, em: string) =>
  db.update(centiLogins).set({ pausadoEm: em, motivo: motivo.slice(0, 300) }).where(eq(centiLogins.usuarioId, usuarioId));

export const comandoUsoLoginCenti = (db: Db, usuarioId: number, em: string) =>
  db.update(centiLogins).set({ ultimoUsoEm: em }).where(eq(centiLogins.usuarioId, usuarioId));

export const comandoApagarLoginCenti = (db: Db, usuarioId: number) => db.delete(centiLogins).where(eq(centiLogins.usuarioId, usuarioId));

/** A IMPORTAÇÃO (o login da extensão antiga): só entra quando não há login guardado — nunca sobrescreve (atômico). */
export const comandoImportarLoginCenti = (db: Db, usuarioId: number, cifrado: string, auto: boolean, em: string) =>
  db
    .insert(centiLogins)
    .values({ usuarioId, cifrado, auto: auto ? 1 : 0, atualizadoEm: em })
    .onConflictDoNothing()
    .returning({ usuarioId: centiLogins.usuarioId });

// ---------------------------------------------------------------- OS NAVEGADORES AUTORIZADOS
/** Quantos navegadores cada pessoa pode ter autorizados (o mais antigo sai). */
export const MAX_NAVEGADORES = 10;

export const consultaChavesLogin = (db: Db, usuarioId: number) =>
  db.select().from(centiLoginChaves).where(eq(centiLoginChaves.usuarioId, usuarioId)).orderBy(desc(centiLoginChaves.id));

export const consultaChaveLogin = (db: Db, usuarioId: number, impressao: string) =>
  db
    .select()
    .from(centiLoginChaves)
    .where(and(eq(centiLoginChaves.usuarioId, usuarioId), eq(centiLoginChaves.impressao, impressao)))
    .limit(1);

/** Autoriza (ou renova) a chave de um navegador e poda além de `MAX_NAVEGADORES` — num lote. */
export function comandosAutorizarChave(db: Db, c: { usuarioId: number; impressao: string; publica: string; navegador: string; em: string; sessaoId: number | null }) {
  return [
    db
      .insert(centiLoginChaves)
      .values({ ...c, criadoEm: c.em })
      .onConflictDoUpdate({ target: [centiLoginChaves.usuarioId, centiLoginChaves.impressao], set: { navegador: c.navegador, criadoEm: c.em, sessaoId: c.sessaoId } }),
    db
      .delete(centiLoginChaves)
      .where(
        and(
          eq(centiLoginChaves.usuarioId, c.usuarioId),
          notInArray(
            centiLoginChaves.id,
            sql`(SELECT k.id FROM centi_login_chaves AS k WHERE k.usuario_id = ${c.usuarioId} ORDER BY k.id DESC LIMIT ${MAX_NAVEGADORES})`,
          ),
        ),
      ),
  ] as const;
}

export const comandoUsoChave = (db: Db, id: number, em: string) => db.update(centiLoginChaves).set({ usadoEm: em }).where(eq(centiLoginChaves.id, id));

export const comandoTirarChave = (db: Db, usuarioId: number, id: number) =>
  db
    .delete(centiLoginChaves)
    .where(and(eq(centiLoginChaves.usuarioId, usuarioId), eq(centiLoginChaves.id, id)))
    .returning({ id: centiLoginChaves.id });

/** Esta sessão já autorizou um navegador sem a senha? */
export const consultaAutorizouNaSessao = (db: Db, usuarioId: number, sessaoId: number) =>
  db
    .select({ id: centiLoginChaves.id })
    .from(centiLoginChaves)
    .where(and(eq(centiLoginChaves.usuarioId, usuarioId), eq(centiLoginChaves.sessaoId, sessaoId)))
    .limit(1);
