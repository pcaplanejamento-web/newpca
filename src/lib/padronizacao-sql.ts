import { and, eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { unidadesMedida } from "../db/schema.ts";

/**
 * Gravação CONDICIONAL (compare-and-set) dos SINÔNIMOS de uma unidade de medida — um BUILDER do Drizzle (sem getDb:
 * testado pelo driver D1 sobre `node:sqlite`, DENTRO de `db.batch` — `tests/padronizacao-sql.test.ts`). Só grava se a
 * lista no banco ainda é a que foi LIDA (`lidos`, gravada sempre como `JSON.stringify` da lista): uma gravação no meio
 * (outra pessoa editou a unidade) não se perde — o UPDATE não casa nada e o `returning` volta VAZIO (a rota avisa).
 */
export function gravarSinonimosSeIgual(db: DrizzleD1Database<typeof schema>, id: number, lidos: readonly string[], novos: readonly string[]) {
  return db
    .update(unidadesMedida)
    .set({ sinonimos: JSON.stringify(novos), atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(and(eq(unidadesMedida.id, id), eq(unidadesMedida.sinonimos, JSON.stringify(lidos))))
    .returning({ id: unidadesMedida.id });
}
