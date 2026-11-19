import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { centiLogins } from "../db/schema.ts";

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
