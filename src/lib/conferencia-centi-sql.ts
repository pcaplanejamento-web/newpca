import { desc, eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { conferenciasCenti } from "../db/schema.ts";

type Db = DrizzleD1Database<Record<string, unknown>>;

/** Quantas conferências ficam no histórico de cada DFD. */
export const MAX_HISTORICO_CENTI = 20;

export type LinhaHistoricoCenti = { dfdId: number; status: string; motivo: string | null; em: string; porNome: string | null };

/** Os comandos (BUILDERS — vão no `db.batch`) que gravam no histórico as conferências que MUDARAM e deixam só as
 * `MAX_HISTORICO_CENTI` mais recentes de cada um desses DFDs. INSERTs de 20 linhas (5 parâmetros — ≤ 100 do D1). */
export function comandosHistoricoCenti(db: Db, linhas: readonly LinhaHistoricoCenti[]) {
  if (!linhas.length) return [];
  const cmds = [];
  for (let i = 0; i < linhas.length; i += 20) cmds.push(db.insert(conferenciasCenti).values(linhas.slice(i, i + 20)));
  const ids = JSON.stringify([...new Set(linhas.map((l) => l.dfdId))]);
  // Nomes por extenso: o Drizzle omite a tabela nas colunas de um DELETE e "c2.dfd_id = dfd_id" compararia a c2 com ela mesma.
  cmds.push(
    db
      .delete(conferenciasCenti)
      .where(
        sql`conferencias_centi.dfd_id IN (SELECT value FROM json_each(${ids})) AND conferencias_centi.id NOT IN (SELECT c2.id FROM conferencias_centi c2 WHERE c2.dfd_id = conferencias_centi.dfd_id ORDER BY c2.id DESC LIMIT ${MAX_HISTORICO_CENTI})`,
      ),
  );
  return cmds;
}

/** O histórico de UM DFD, da mais recente à mais antiga. */
export function consultaHistoricoCenti(db: Db, dfdId: number) {
  return db
    .select({ id: conferenciasCenti.id, status: conferenciasCenti.status, motivo: conferenciasCenti.motivo, em: conferenciasCenti.em, porNome: conferenciasCenti.porNome })
    .from(conferenciasCenti)
    .where(eq(conferenciasCenti.dfdId, dfdId))
    .orderBy(desc(conferenciasCenti.id))
    .limit(MAX_HISTORICO_CENTI);
}
