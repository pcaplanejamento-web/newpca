import { and, eq, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { trelloFila, trelloQuadros, trelloVinculos } from "../db/schema.ts";
import { PRIORIDADE_FILA } from "./trello-sync-core.ts";

type Db = DrizzleD1Database<typeof schema>;

/** A prioridade do tipo (board › listas › etiquetas › campos › cartões) em SQL — constantes do código, sem entrada. */
const ORDEM_FILA = sql.raw(`CASE tipo ${Object.entries(PRIORIDADE_FILA).map(([t, n]) => `WHEN '${t}' THEN ${n}`).join(" ")} ELSE 9 END`);

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
    .where(eq(trelloFila.id, sql`(SELECT id FROM trello_fila WHERE proxima_em <= CURRENT_TIMESTAMP${filtro} ORDER BY ${ORDEM_FILA}, id LIMIT 1)`))
    .returning();
}

/** Conclui: sai da fila SÓ se nada novo chegou no meio (o `criado_em` renovado mantém o item). */
export function comandoConcluir(db: Db, id: number, criadoEm: string | null) {
  return db.delete(trelloFila).where(and(eq(trelloFila.id, id), eq(trelloFila.criadoEm, criadoEm ?? "")));
}

/**
 * Grava (ou atualiza) um vínculo pelo (tipo, id daqui) — TOLERANTE: um item do Trello é ligado a UM item daqui, então,
 * se o id do Trello já pertence a OUTRO item daqui, nada muda (nunca lança o UNIQUE do banco). Dois builders para o MESMO
 * lote: o INSERT que não faz nada em conflito e o UPDATE do próprio vínculo só quando o id do Trello está livre.
 */
export function comandosVinculo(db: Db, quadroId: number, tipo: string, localId: number, trelloId: string, retrato: string | null) {
  return [
    db.insert(trelloVinculos).values({ quadroId, tipo, localId, trelloId, retrato }).onConflictDoNothing(),
    db
      .update(trelloVinculos)
      .set({ quadroId, trelloId, retrato, sincronizadoEm: sql`(CURRENT_TIMESTAMP)` })
      .where(
        and(
          eq(trelloVinculos.tipo, tipo),
          eq(trelloVinculos.localId, localId),
          sql`NOT EXISTS (SELECT 1 FROM trello_vinculos o WHERE o.tipo = ${tipo} AND o.trello_id = ${trelloId} AND o.local_id <> ${localId})`,
        ),
      ),
  ] as const;
}

/** Validade da trava de um quadro (renovada a cada item). */
export const TRAVA_S = 90;

/** PEGA a trava do quadro (livre ou vencida) — atômico; devolve a linha só quando pegou. */
export function comandoTravarQuadro(db: Db, quadroId: number) {
  return db
    .update(trelloQuadros)
    .set({ processandoAte: sql`datetime('now', ${`+${TRAVA_S} seconds`})` })
    .where(and(eq(trelloQuadros.quadroId, quadroId), sql`(${trelloQuadros.processandoAte} IS NULL OR ${trelloQuadros.processandoAte} < CURRENT_TIMESTAMP)`))
    .returning({ quadroId: trelloQuadros.quadroId });
}

/** RENOVA a trava que esta passada já tem (mais uma validade inteira). */
export function comandoRenovarTrava(db: Db, quadroId: number) {
  return db
    .update(trelloQuadros)
    .set({ processandoAte: sql`datetime('now', ${`+${TRAVA_S} seconds`})` })
    .where(eq(trelloQuadros.quadroId, quadroId));
}

/** SOLTA a trava do quadro. */
export function comandoSoltarQuadro(db: Db, quadroId: number) {
  return db.update(trelloQuadros).set({ processandoAte: null }).where(eq(trelloQuadros.quadroId, quadroId));
}
