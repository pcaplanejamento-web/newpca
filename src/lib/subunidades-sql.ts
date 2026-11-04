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
 * GRAVA o cadastro INTEIRO de uma unidade num lote atômico: o modo e os centros da unidade (modo único), as subunidades
 * que saem (os DFDs com ela escolhida ficam sem — FK `set null`), as que ficam (nome, ordem, centros) e as novas, na
 * ordem da lista. Os ids que ficam já foram conferidos como da unidade (a rota). Builders para `db.batch`.
 */
export function comandosGravarSubunidades(db: Db, unidadeId: number, modo: ModoCentro, centros: string[], lista: SubunidadeEnviada[]) {
  const ficam = lista.filter((s) => s.id != null).map((s) => s.id as number);
  const cmds: BatchItem<"sqlite">[] = [
    db.update(reparticoes).set({ modoCentro: modo, centrosCusto: JSON.stringify(centros), atualizadoEm: sql`(CURRENT_TIMESTAMP)` }).where(eq(reparticoes.id, unidadeId)),
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

/** Os CENTROS DE CUSTO distintos gravados nos DFDs, com quantos DFDs têm cada um e quantos são DA UNIDADE
 * pedida (as opções do cadastro — os da unidade primeiro). Builder puro. */
export function consultaCentrosDosDfds(db: Db, unidadeId = 0) {
  const daUnidade = sql<number>`SUM(CASE WHEN ${dfds.reparticaoId} = ${unidadeId} THEN 1 ELSE 0 END)`;
  return db
    .select({
      centro: dfds.centroCusto,
      dfds: sql<number>`COUNT(*)`,
      daUnidade,
    })
    .from(dfds)
    .where(sql`trim(COALESCE(${dfds.centroCusto}, '')) <> ''`)
    .groupBy(dfds.centroCusto)
    .orderBy(sql`${daUnidade} DESC`, asc(dfds.centroCusto));
}

/** Os centros de custo distintos dos DFDs POR UNIDADE (os "a cadastrar" da lista de unidades). Builder puro. */
export function consultaCentrosPorUnidade(db: Db) {
  return db
    .select({ reparticaoId: dfds.reparticaoId, centro: dfds.centroCusto })
    .from(dfds)
    .where(sql`${dfds.reparticaoId} IS NOT NULL AND trim(COALESCE(${dfds.centroCusto}, '')) <> ''`)
    .groupBy(dfds.reparticaoId, dfds.centroCusto);
}

/** Tira centros de custo de OUTROS cadastros (o MOVER para esta unidade): cada alvo recebe a lista nova — a unidade
 * (modo único, `subunidadeId` null) ou a subunidade. Builders para o MESMO `db.batch` da gravação. */
export function comandosTirarCentros(db: Db, alvos: { reparticaoId: number; subunidadeId: number | null; centros: string[] }[]) {
  return alvos.map((a) =>
    a.subunidadeId == null
      ? db.update(reparticoes).set({ centrosCusto: JSON.stringify(a.centros), atualizadoEm: sql`(CURRENT_TIMESTAMP)` }).where(eq(reparticoes.id, a.reparticaoId))
      : db
          .update(subunidades)
          .set({ centrosCusto: JSON.stringify(a.centros) })
          .where(and(eq(subunidades.id, a.subunidadeId), eq(subunidades.reparticaoId, a.reparticaoId))),
  );
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

/** Quantos DFDs estão com cada subunidade da unidade ESCOLHIDA (o aviso antes de tirá-la). Builder puro. */
export function consultaMarcadosPorSubunidade(db: Db, unidadeId: number) {
  return db
    .select({ id: subunidades.id, n: sql<number>`COUNT(${dfds.id})` })
    .from(subunidades)
    .innerJoin(dfds, eq(dfds.subunidadeId, subunidades.id))
    .where(eq(subunidades.reparticaoId, unidadeId))
    .groupBy(subunidades.id);
}

/** A subunidade escolhida no DFD, mantida só se pertencer à unidade (`null` = sem unidade) — o SET da troca de unidade
 * (o PATCH, a massa e a sobrescrita). */
export const subunidadeDaUnidade = (reparticaoId: number | null) =>
  reparticaoId == null ? null : sql`(SELECT s.id FROM subunidades s WHERE s.id = "dfds"."subunidade_id" AND s.reparticao_id = ${reparticaoId})`;
