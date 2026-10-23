import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { centiUnidades, empenhos } from "../db/schema.ts";
import type { UnidadeCenti } from "./centi-unidades-core.ts";

/**
 * As UNIDADES DA CENTI no banco — BUILDERS do Drizzle (testados no driver D1 REAL sobre `node:sqlite`, dentro de
 * `db.batch` — `tests/centi-unidades.test.ts`). Tudo num parâmetro JSON (`json_each`): nunca o teto de 100 parâmetros.
 */
type Db = DrizzleD1Database<typeof schema>;

/**
 * Os nomes QUALIFICADOS (nos UPDATE/DELETE de uma tabela só o Drizzle omite o nome da tabela — dentro de uma subconsulta a
 * coluna seria a da outra tabela, ou a do `json_each`).
 */
const CU = (c: string) => sql.raw(`"centi_unidades"."${c}"`);
const EM = (c: string) => sql.raw(`"empenhos"."${c}"`);

/** Casa o empenho com a unidade da Centi (o par exato; a unidade vazia = ""). */
export const casaEmpenho = sql`${CU("orgao_gestor")} = ${EM("orgao_gestor")} AND ${CU("unidade")} = IFNULL(${EM("unidade_orcamentaria")}, '')`;

/** Instante ISO com ms — entra na versão dos empenhos (dois vínculos no mesmo segundo ainda mudam a versão). */
const agoraIso = () => new Date().toISOString();

/**
 * REGISTRA as unidades de uma página lida (`[órgão gestor, unidade, registros]`): a nova entra sem vínculo; a conhecida
 * soma os registros desta leitura (zera ao ser vista por outro lote) e guarda o ano mais recente. O vínculo nunca muda.
 */
export function comandoRegistrarUnidades(db: Db, loteId: number, ano: number, pares: [string, string, number][]) {
  const sel = db
    .select({
      id: sql<null>`NULL`.as("id"),
      orgaoGestor: sql<string>`json_extract(value, '$[0]')`.as("orgao_gestor"),
      unidade: sql<string>`json_extract(value, '$[1]')`.as("unidade"),
      orgaoId: sql<null>`NULL`.as("orgao_id"),
      reparticaoId: sql<null>`NULL`.as("reparticao_id"),
      registros: sql<number>`json_extract(value, '$[2]')`.as("registros"),
      ultimoLote: sql<number>`${loteId}`.as("ultimo_lote"),
      ultimoAno: sql<number>`${ano}`.as("ultimo_ano"),
      vistoEm: sql<string>`CURRENT_TIMESTAMP`.as("visto_em"),
      vinculadoEm: sql<null>`NULL`.as("vinculado_em"),
      vinculadoPor: sql<null>`NULL`.as("vinculado_por"),
    })
    .from(sql`json_each(${JSON.stringify(pares)})`)
    .where(sql`1`);
  return db
    .insert(centiUnidades)
    .select(sel as never)
    .onConflictDoUpdate({
      target: [centiUnidades.orgaoGestor, centiUnidades.unidade],
      set: {
        registros: sql`CASE WHEN ${CU("ultimo_lote")} IS excluded.ultimo_lote THEN ${CU("registros")} + excluded.registros ELSE excluded.registros END`,
        ultimoLote: sql`excluded.ultimo_lote`,
        ultimoAno: sql`MAX(IFNULL(${CU("ultimo_ano")}, 0), excluded.ultimo_ano)`,
        vistoEm: sql`CURRENT_TIMESTAMP`,
      },
    });
}

/**
 * VINCULA (ou desvincula) várias unidades num LOTE ATÔMICO — `[id, órgão|null, unidade|null]`: grava o vínculo, APAGA os
 * empenhos das que ficaram SEM vínculo (o banco só guarda o que é do cadastro) e passa os das vinculadas ao órgão/unidade
 * novos. O que entrar depois chega pela próxima importação.
 */
export function comandosVincular(db: Db, itens: [number, number | null, number | null][], quem: string) {
  const json = JSON.stringify(itens);
  const ids = sql`(SELECT json_extract(value, '$[0]') FROM json_each(${json}))`;
  const campo = (i: number) => sql`(SELECT json_extract(value, ${`$[${i}]`}) FROM json_each(${json}) WHERE json_extract(value, '$[0]') = ${CU("id")})`;
  const dasPedidas = sql`${CU("id")} IN ${ids}`;
  return [
    db
      .update(centiUnidades)
      .set({ orgaoId: campo(1), reparticaoId: campo(2), vinculadoEm: agoraIso(), vinculadoPor: quem })
      .where(dasPedidas),
    db.delete(empenhos).where(sql`EXISTS (SELECT 1 FROM "centi_unidades" WHERE ${casaEmpenho} AND ${dasPedidas} AND ${CU("orgao_id")} IS NULL)`),
    db
      .update(empenhos)
      .set({
        orgaoId: sql`(SELECT ${CU("orgao_id")} FROM "centi_unidades" WHERE ${casaEmpenho})`,
        reparticaoId: sql`(SELECT ${CU("reparticao_id")} FROM "centi_unidades" WHERE ${casaEmpenho})`,
      })
      .where(sql`EXISTS (SELECT 1 FROM "centi_unidades" WHERE ${casaEmpenho} AND ${dasPedidas} AND ${CU("orgao_id")} IS NOT NULL)`),
  ] as const;
}

/** As unidades da Centi com quantos empenhos GRAVADOS cada uma tem — sem vínculo primeiro, depois pelo órgão gestor. */
export async function consultaUnidadesCenti(db: Db): Promise<UnidadeCenti[]> {
  const l = await db
    .select({
      id: centiUnidades.id,
      orgaoGestor: centiUnidades.orgaoGestor,
      unidade: centiUnidades.unidade,
      orgaoId: centiUnidades.orgaoId,
      reparticaoId: centiUnidades.reparticaoId,
      registros: centiUnidades.registros,
      ultimoAno: centiUnidades.ultimoAno,
      vistoEm: centiUnidades.vistoEm,
      vinculadoEm: centiUnidades.vinculadoEm,
      vinculadoPor: centiUnidades.vinculadoPor,
      gravados: sql<number>`(SELECT COUNT(*) FROM "empenhos" WHERE ${casaEmpenho})`,
    })
    .from(centiUnidades)
    .orderBy(sql`${centiUnidades.orgaoId} IS NOT NULL`, centiUnidades.orgaoGestor, centiUnidades.unidade);
  return l.map((u) => ({ ...u, gravados: Number(u.gravados) }));
}

/** Quantas unidades o lote viu e quantas delas estão sem vínculo (o resumo de "Puxar unidades"). */
export async function contagemUnidadesDoLote(db: Db, loteId: number): Promise<{ total: number; semVinculo: number }> {
  const [r] = await db
    .select({ total: sql<number>`COUNT(*)`, semVinculo: sql<number>`SUM(CASE WHEN ${centiUnidades.orgaoId} IS NULL THEN 1 ELSE 0 END)` })
    .from(centiUnidades)
    .where(sql`${centiUnidades.ultimoLote} = ${loteId}`);
  return { total: Number(r?.total ?? 0), semVinculo: Number(r?.semVinculo ?? 0) };
}
