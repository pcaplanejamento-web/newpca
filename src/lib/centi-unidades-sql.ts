import { and, eq, isNotNull, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { centiAcoes, centiUnidades, empenhos, orgaos } from "../db/schema.ts";
import type { AcaoCenti, MapaVinculo, UnidadeCenti } from "./centi-unidades-core.ts";

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
const casaEmpenho = sql`${CU("orgao_gestor")} = ${EM("orgao_gestor")} AND ${CU("unidade")} = IFNULL(${EM("unidade_orcamentaria")}, '')`;

/**
 * REGISTRA as unidades de uma página lida (`[órgão gestor, unidade, registros]`): a nova entra no órgão do órgão gestor
 * (se algum órgão o escolheu) e sem unidade; a conhecida
 * soma os registros desta leitura (zera ao ser vista por outro lote) e guarda o ano mais recente. O vínculo nunca muda.
 */
export function comandoRegistrarUnidades(db: Db, loteId: number, ano: number, pares: [string, string, number][]) {
  const sel = db
    .select({
      id: sql<null>`NULL`.as("id"),
      orgaoGestor: sql<string>`json_extract(value, '$[0]')`.as("orgao_gestor"),
      unidade: sql<string>`json_extract(value, '$[1]')`.as("unidade"),
      // A unidade nova já nasce no órgão do órgão gestor dela (a escolha de unidade vem depois, no cadastro).
      orgaoId: sql<number | null>`(SELECT o."id" FROM "orgaos" o WHERE o."centi_orgao_gestor" = json_extract(value, '$[0]'))`.as("orgao_id"),
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
    .select({
      total: sql<number>`COUNT(*)`,
      semVinculo: sql<number>`SUM(CASE WHEN ${CU("orgao_id")} IS NULL AND NOT EXISTS (SELECT 1 FROM "centi_acoes" ca WHERE ca."centi_unidade_id" = ${CU("id")} AND ca."reparticao_id" IS NOT NULL) THEN 1 ELSE 0 END)`,
    })
    .from(centiUnidades)
    .where(sql`${centiUnidades.ultimoLote} = ${loteId}`);
  return { total: Number(r?.total ?? 0), semVinculo: Number(r?.semVinculo ?? 0) };
}

/**
 * O VÍNCULO de um registro (empenho gravado ou do staging) — a ação vinculada › a unidade orçamentária vinculada › o órgão
 * do órgão gestor: a MESMA régua da VIEW `centi_vinculo_empenhos` dos gatilhos (migração `0140`). `orgao` nulo = sem vínculo.
 */
export function vinculoSql(tabela: "empenhos" | "empenhos_staging"): { orgao: SQL; reparticao: SQL } {
  const T = `"${tabela}"`;
  const acao = `(SELECT ca."reparticao_id" FROM "centi_acoes" ca JOIN "centi_unidades" cu ON cu."id" = ca."centi_unidade_id" WHERE cu."orgao_gestor" = ${T}."orgao_gestor" AND cu."unidade" = IFNULL(${T}."unidade_orcamentaria", '') AND ca."acao" = IFNULL(${T}."acao", '') AND ca."reparticao_id" IS NOT NULL)`;
  const cu = (c: string) => `(SELECT cu."${c}" FROM "centi_unidades" cu WHERE cu."orgao_gestor" = ${T}."orgao_gestor" AND cu."unidade" = IFNULL(${T}."unidade_orcamentaria", ''))`;
  return {
    orgao: sql.raw(`COALESCE((SELECT r."orgao_id" FROM "reparticoes" r WHERE r."id" = ${acao}), ${cu("orgao_id")})`),
    reparticao: sql.raw(`COALESCE(${acao}, ${cu("reparticao_id")})`),
  };
}

/** O que está vinculado AGORA (três consultas pequenas) — a leitura decide por ele o que entra no banco. */
export async function consultaMapaVinculo(db: Db): Promise<MapaVinculo> {
  const [g, u, a] = await Promise.all([
    db.select({ g: orgaos.centiOrgaoGestor }).from(orgaos).where(isNotNull(orgaos.centiOrgaoGestor)),
    db.select({ g: centiUnidades.orgaoGestor, u: centiUnidades.unidade }).from(centiUnidades).where(isNotNull(centiUnidades.orgaoId)),
    db
      .select({ g: centiUnidades.orgaoGestor, u: centiUnidades.unidade, a: centiAcoes.acao })
      .from(centiAcoes)
      .innerJoin(centiUnidades, eq(centiUnidades.id, centiAcoes.centiUnidadeId))
      .where(isNotNull(centiAcoes.reparticaoId)),
  ]);
  return {
    gestores: new Set(g.map((x) => x.g as string)),
    unidades: new Set(u.map((x) => `${x.g}\u0000${x.u}`)),
    acoes: new Set(a.map((x) => `${x.g}\u0000${x.u}\u0000${x.a}`)),
  };
}

/** REGISTRA as AÇÕES de uma página (`[órgão gestor, unidade, ação, registros]`) — depois das unidades, no MESMO lote. */
export function comandoRegistrarAcoes(db: Db, loteId: number, ano: number, quadras: [string, string, string, number][]) {
  const sel = db
    .select({
      id: sql<null>`NULL`.as("id"),
      centiUnidadeId: sql<number>`(SELECT cu."id" FROM "centi_unidades" cu WHERE cu."orgao_gestor" = json_extract(value, '$[0]') AND cu."unidade" = json_extract(value, '$[1]'))`.as("centi_unidade_id"),
      acao: sql<string>`json_extract(value, '$[2]')`.as("acao"),
      reparticaoId: sql<null>`NULL`.as("reparticao_id"),
      registros: sql<number>`json_extract(value, '$[3]')`.as("registros"),
      ultimoLote: sql<number>`${loteId}`.as("ultimo_lote"),
      ultimoAno: sql<number>`${ano}`.as("ultimo_ano"),
      vistoEm: sql<string>`CURRENT_TIMESTAMP`.as("visto_em"),
      vinculadoEm: sql<null>`NULL`.as("vinculado_em"),
    })
    .from(sql`json_each(${JSON.stringify(quadras)})`)
    .where(sql`1`);
  const CA = (c: string) => sql.raw(`"centi_acoes"."${c}"`);
  return db
    .insert(centiAcoes)
    .select(sel as never)
    .onConflictDoUpdate({
      target: [centiAcoes.centiUnidadeId, centiAcoes.acao],
      set: {
        registros: sql`CASE WHEN ${CA("ultimo_lote")} IS excluded.ultimo_lote THEN ${CA("registros")} + excluded.registros ELSE excluded.registros END`,
        ultimoLote: sql`excluded.ultimo_lote`,
        ultimoAno: sql`MAX(IFNULL(${CA("ultimo_ano")}, 0), excluded.ultimo_ano)`,
        vistoEm: sql`CURRENT_TIMESTAMP`,
      },
    });
}

/** As AÇÕES da Centi já lidas, com a unidade orçamentária e a unidade do cadastro escolhida. */
export async function consultaAcoesCenti(db: Db): Promise<AcaoCenti[]> {
  return db
    .select({
      id: centiAcoes.id,
      centiUnidadeId: centiAcoes.centiUnidadeId,
      orgaoGestor: centiUnidades.orgaoGestor,
      unidade: centiUnidades.unidade,
      acao: centiAcoes.acao,
      reparticaoId: centiAcoes.reparticaoId,
      registros: centiAcoes.registros,
      ultimoAno: centiAcoes.ultimoAno,
    })
    .from(centiAcoes)
    .innerJoin(centiUnidades, eq(centiUnidades.id, centiAcoes.centiUnidadeId))
    .orderBy(centiUnidades.orgaoGestor, centiUnidades.unidade, centiAcoes.acao);
}

/**
 * VINCULA as ações à unidade do cadastro (`ids` = a lista INTEIRA da unidade: as que saíram voltam a ficar sem unidade)
 * e, no MESMO lote, refaz o vínculo dos empenhos gravados — o que ficou sem vínculo SAI do banco.
 */
export function comandosVincularAcoes(db: Db, reparticaoId: number, ids: number[]) {
  const agora = sql`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
  const lista = sql`(SELECT value FROM json_each(${JSON.stringify(ids)}))`;
  return [
    db
      .update(centiAcoes)
      .set({ reparticaoId: null, vinculadoEm: agora })
      .where(and(eq(centiAcoes.reparticaoId, reparticaoId), sql`${centiAcoes.id} NOT IN ${lista}`)),
    db
      .update(centiAcoes)
      .set({ reparticaoId, vinculadoEm: agora })
      .where(and(sql`${centiAcoes.id} IN ${lista}`, sql`${centiAcoes.reparticaoId} IS NOT ${reparticaoId}`)),
    ...comandosRefazerVinculoEmpenhos(db),
  ] as const;
}

/** Refaz o vínculo dos empenhos gravados pela régua única (o sem vínculo SAI; os demais acompanham o órgão/unidade). */
export function comandosRefazerVinculoEmpenhos(db: Db) {
  const v = vinculoSql("empenhos");
  return [
    db.delete(empenhos).where(sql`${v.orgao} IS NULL`),
    db
      .update(empenhos)
      .set({ orgaoId: sql`${v.orgao}`, reparticaoId: sql`${v.reparticao}` })
      .where(sql`"empenhos"."orgao_id" IS NOT ${v.orgao} OR "empenhos"."reparticao_id" IS NOT ${v.reparticao}`),
  ] as const;
}
