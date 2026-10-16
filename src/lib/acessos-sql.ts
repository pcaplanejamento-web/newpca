import { and, desc, eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { acessos, usuarios } from "../db/schema.ts";

type Db = DrizzleD1Database<typeof schema>;

/** Quantos acessos ficam guardados por pessoa (os mais antigos saem a cada login). */
export const MAX_ACESSOS = 50;

export type NovoAcesso = { usuarioId: number; em: string; canal: string; navegador: string; ip: string | null; aparelho: string; novo: boolean };

/** Um LOGIN: grava o acesso, poda além de `MAX_ACESSOS` e marca o último acesso — num lote atômico. */
export function comandosRegistrarAcesso(db: Db, a: NovoAcesso) {
  return [
    db.insert(acessos).values(a),
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
    .select({ id: acessos.id, em: acessos.em, canal: acessos.canal, navegador: acessos.navegador, ip: acessos.ip, aparelho: acessos.aparelho, novo: acessos.novo })
    .from(acessos)
    .where(eq(acessos.usuarioId, usuarioId))
    .orderBy(desc(acessos.id))
    .limit(MAX_ACESSOS);
}
