import { and, ne, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { pcaDfds } from "../db/schema.ts";

type Db = DrizzleD1Database<typeof schema>;

/**
 * Os DFDs (dos ids dados) que já estão em OUTRO PCA — numa ÚNICA consulta, com os ids num só parâmetro JSON
 * (`IN (SELECT value FROM json_each(?))`, o padrão de `catalogo-sql.ts`), qualquer que seja a quantidade. Antes era uma
 * consulta a cada 90 ids: na Mesa de um PCA com 2.000 DFDs, 23 das 50 consultas que o Worker permite por requisição.
 * Builder sem getDb (testado pelo driver D1 real). Puro.
 */
export function consultaDfdsEmOutroPca(db: Db, dfdIds: number[], pcaId: number) {
  return db
    .select({ dfdId: pcaDfds.dfdId, pcaId: pcaDfds.pcaId })
    .from(pcaDfds)
    .where(and(sql`${pcaDfds.dfdId} IN (SELECT value FROM json_each(${JSON.stringify(dfdIds)}))`, ne(pcaDfds.pcaId, pcaId)));
}
