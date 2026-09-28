import { and, eq, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { trelloFila, trelloVinculos } from "../db/schema.ts";

type Db = DrizzleD1Database<typeof schema>;

/**
 * Os BUILDERS da sincronização com o Trello (testados no driver D1 real, `tests/trello-sql.test.ts`): a fila (entrar,
 * reivindicar, concluir) e os vínculos.
 */

/** Põe na fila — ou RENOVA o item que já estava (a mudança nova não se perde enquanto o anterior processa). */
export function comandoEnfileirar(db: Db, quadroId: number, direcao: string, tipo: string, alvo: string) {
  return db
    .insert(trelloFila)
    .values({ quadroId, direcao, tipo, alvo })
    .onConflictDoUpdate({
      target: [trelloFila.direcao, trelloFila.tipo, trelloFila.alvo],
      set: { quadroId, proximaEm: sql`(CURRENT_TIMESTAMP)`, criadoEm: sql`strftime('%Y-%m-%d %H:%M:%f', 'now')`, tentativas: 0, erro: null },
    });
}

/** REIVINDICA o próximo item devido (de um quadro ou de todos) numa instrução só — dois processamentos nunca pegam o mesmo. */
export function comandoReivindicar(db: Db, quadroId?: number) {
  const filtro: SQL = quadroId != null ? sql` AND quadro_id = ${quadroId}` : sql``;
  return db
    .update(trelloFila)
    .set({ proximaEm: sql`datetime('now', '+120 seconds')`, tentativas: sql`${trelloFila.tentativas} + 1` })
    .where(eq(trelloFila.id, sql`(SELECT id FROM trello_fila WHERE proxima_em <= CURRENT_TIMESTAMP${filtro} ORDER BY id LIMIT 1)`))
    .returning();
}

/** Conclui: sai da fila SÓ se nada novo chegou no meio (o `criado_em` renovado mantém o item). */
export function comandoConcluir(db: Db, id: number, criadoEm: string | null) {
  return db.delete(trelloFila).where(and(eq(trelloFila.id, id), eq(trelloFila.criadoEm, criadoEm ?? "")));
}

/** Grava (ou atualiza) um vínculo pelo (tipo, id daqui). */
export function comandoVinculo(db: Db, quadroId: number, tipo: string, localId: number, trelloId: string, retrato: string | null) {
  return db
    .insert(trelloVinculos)
    .values({ quadroId, tipo, localId, trelloId, retrato })
    .onConflictDoUpdate({ target: [trelloVinculos.tipo, trelloVinculos.localId], set: { trelloId, retrato, sincronizadoEm: sql`(CURRENT_TIMESTAMP)` } });
}
