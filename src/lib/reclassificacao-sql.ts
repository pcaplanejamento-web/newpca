import { inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { dfdItens, itens } from "../db/schema.ts";

/**
 * Builders da CLASSIFICAÇÃO + DOMÍNIO GRAVADOS (testados no driver D1 real — `tests/reclassificacao.test.ts`): os itens com a
 * versão do cadastro diferente da atual são lidos em lotes e gravados AGRUPADOS pelo resultado — um UPDATE por par
 * (classificação, domínio) com os ids num parâmetro JSON (poucos comandos, qualquer que seja o lote).
 */
type Db = DrizzleD1Database<typeof schema>;

const ids = (lista: readonly number[]) => sql`(SELECT value FROM json_each(${JSON.stringify(lista)}))`;

export function consultaPendentesDfd(db: Db, versao: string, limite: number) {
  return db
    .select({ id: dfdItens.id, descricao: dfdItens.descricao, unidade: dfdItens.unidade })
    .from(dfdItens)
    .where(or(isNull(dfdItens.classificadoVersao), ne(dfdItens.classificadoVersao, versao)))
    .limit(limite);
}

export function consultaPendentesPlanilha(db: Db, versao: string, limite: number) {
  return db
    .select({ id: itens.id, descricao: itens.nomeProduto, unidade: itens.unidadeMedida, classificacao: itens.classificacaoNorm, dominio: itens.dominio })
    .from(itens)
    .where(or(isNull(itens.classificadoVersao), ne(itens.classificadoVersao, versao)))
    .limit(limite);
}

/** O resultado de cada item: id → [classificação, domínio] (UM parâmetro JSON — UM comando por tabela). */
export type Resultados = Record<number, [string, string]>;
const de = (json: string, col: 0 | 1) => sql`json_extract(${json}, '$."' || id || '"[${sql.raw(String(col))}]')`;

export function comandoGravarDfd(db: Db, versao: string, r: Resultados) {
  const json = JSON.stringify(r);
  return db
    .update(dfdItens)
    .set({ classificacao: de(json, 0), dominio: de(json, 1), classificadoVersao: versao })
    .where(inArray(dfdItens.id, ids(Object.keys(r).map(Number))));
}

export function comandoGravarPlanilha(db: Db, versao: string, r: Resultados) {
  const json = JSON.stringify(r);
  return db
    .update(itens)
    .set({ classificacaoCat: de(json, 0), dominioCat: de(json, 1), classificadoVersao: versao })
    .where(inArray(itens.id, ids(Object.keys(r).map(Number))));
}
