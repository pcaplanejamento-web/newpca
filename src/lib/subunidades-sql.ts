import { and, asc, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { dfds, reparticoes, subunidades } from "../db/schema.ts";
import type { ModoCentro, SubunidadeEnviada } from "./subunidades-core.ts";

type Db = DrizzleD1Database<typeof schema>;

/** Linhas por INSERT de subunidades (4 parâmetros cada — ≤ 100 por statement no D1). */
const POR_INSERT = 20;

/** As subunidades das unidades (os ids num só parâmetro JSON), na ordem. Builder puro. */
export function consultaSubunidades(db: Db, unidades: number[]) {
  return db
    .select({ id: subunidades.id, reparticaoId: subunidades.reparticaoId, nome: subunidades.nome, centros: subunidades.centrosCusto })
    .from(subunidades)
    .where(sql`${subunidades.reparticaoId} IN (SELECT value FROM json_each(${JSON.stringify(unidades)}))`)
    .orderBy(asc(subunidades.reparticaoId), asc(subunidades.ordem), asc(subunidades.id));
}

/**
 * GRAVA o cadastro INTEIRO de uma unidade num lote atômico: o modo, as subunidades que saem, as que ficam (nome, ordem,
 * centros) e as novas, na ordem da lista. Os ids que ficam já foram conferidos como da unidade (a rota). Builders para
 * `db.batch`.
 */
export function comandosGravarSubunidades(db: Db, unidadeId: number, modo: ModoCentro, lista: SubunidadeEnviada[]) {
  const ficam = lista.filter((s) => s.id != null).map((s) => s.id as number);
  const cmds: BatchItem<"sqlite">[] = [
    db.update(reparticoes).set({ modoCentro: modo, atualizadoEm: sql`(CURRENT_TIMESTAMP)` }).where(eq(reparticoes.id, unidadeId)),
    db
      .delete(subunidades)
      .where(and(eq(subunidades.reparticaoId, unidadeId), sql`${subunidades.id} NOT IN (SELECT value FROM json_each(${JSON.stringify(ficam)}))`)),
  ];
  lista.forEach((s, ordem) => {
    if (s.id == null) return;
    cmds.push(
      db
        .update(subunidades)
        .set({ nome: s.nome.trim(), ordem, centrosCusto: JSON.stringify(s.centros) })
        .where(and(eq(subunidades.id, s.id), eq(subunidades.reparticaoId, unidadeId))),
    );
  });
  const novas = lista.map((s, ordem) => ({ s, ordem })).filter((x) => x.s.id == null);
  for (let i = 0; i < novas.length; i += POR_INSERT)
    cmds.push(
      db.insert(subunidades).values(
        novas.slice(i, i + POR_INSERT).map(({ s, ordem }) => ({ reparticaoId: unidadeId, nome: s.nome.trim(), ordem, centrosCusto: JSON.stringify(s.centros) })),
      ),
    );
  return cmds;
}

/** Os CENTROS DE CUSTO distintos gravados nos DFDs, com quantos DFDs têm cada um (as opções do cadastro). Builder puro. */
export function consultaCentrosDosDfds(db: Db) {
  return db
    .select({ centro: dfds.centroCusto, dfds: sql<number>`COUNT(*)` })
    .from(dfds)
    .where(sql`trim(COALESCE(${dfds.centroCusto}, '')) <> ''`)
    .groupBy(dfds.centroCusto)
    .orderBy(asc(dfds.centroCusto));
}

/** DFDs por comando do Centro de Custo (a lista vai num só parâmetro JSON). */
export const CENTROS_POR_COMANDO = 1000;

/**
 * Grava o CENTRO DE CUSTO lido na Centi nos DFDs (`null` = a Centi respondeu sem o dado: limpa) num ÚNICO UPDATE por
 * fatia — a lista num parâmetro JSON (`UPDATE … FROM`, a página com `LIMIT -1` por fora — não é desfeita na junção). Só
 * os que MUDAM; devolve as linhas alteradas pelo `RETURNING`. Para `db.all` (fora de `db.batch` — comando cru).
 */
export function sqlCentroCusto(linhas: { id: number; centro: string | null }[]) {
  const json = JSON.stringify(linhas.map((l) => ({ i: l.id, c: l.centro })));
  return sql`UPDATE ${dfds} SET centro_custo = v.c, centro_custo_em = CURRENT_TIMESTAMP
    FROM (SELECT json_extract(value, '$.i') AS i, json_extract(value, '$.c') AS c FROM json_each(${json}) LIMIT -1) v
    WHERE ${dfds}.id = v.i AND ${dfds}.centro_custo IS NOT v.c
    RETURNING ${dfds}.id`;
}
