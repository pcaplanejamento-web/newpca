import { eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { catalogoItens, catalogos } from "../db/schema.ts";

type Db = DrizzleD1Database<typeof schema>;

/**
 * Entradas do CATÁLOGO (as colunas da referência) dos códigos dados numa ÚNICA consulta — os códigos vão num só
 * parâmetro JSON (`IN (SELECT value FROM json_each(?))`): sem o teto de 100 parâmetros do D1 e sem N consultas por
 * invocação (a Mesa confere milhares de itens de uma vez). Builder sem getDb (testado pelo driver D1 real). Puro.
 */
export function consultaEntradasCatalogo(db: Db, codigos: string[]) {
  return db
    .select({
      codigo: catalogoItens.codigo,
      codigoRaw: catalogoItens.codigoRaw,
      descricao: catalogoItens.descricao,
      unidade: catalogoItens.unidade,
      tipos: catalogoItens.tipos,
      catalogoNome: catalogos.nome,
    })
    .from(catalogoItens)
    .innerJoin(catalogos, eq(catalogoItens.catalogoId, catalogos.id))
    .where(sql`${catalogoItens.codigo} IN (SELECT value FROM json_each(${JSON.stringify(codigos)}))`);
}
