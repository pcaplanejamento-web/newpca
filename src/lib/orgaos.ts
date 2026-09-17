import { and, asc, eq, ne, sql } from "drizzle-orm";
import { dfdProtocolos, dfds, orgaos, reparticoes } from "@/db/schema";
import { getDb } from "./db";

/**
 * Acesso aos ÓRGÃOS (entidade organizacional ACIMA da unidade). Só escopo de request
 * (`getDb`). `listarOrgaos` alimenta o seletor de Órgão no cadastro de unidades E o match
 * do "Órgão/Entidade" do DFD (threadado ao cliente como `pcas`/`regras`). Devolve TODOS
 * (com a flag `oculto`); os matchers e os seletores de documento NOVO filtram os ocultos.
 */
export type OrgaoResumo = {
  id: number;
  sigla: string;
  nome: string;
  orgaoEntidade: string | null;
  ordem: number;
  /** 1 = os responsáveis do órgão valem p/ todas as unidades (assinatura única). */
  assinaturaUnica: boolean;
  /** Nº do interessado do órgão (o protocolo pode vir em nome do órgão). */
  numeroInteressado: string | null;
  /** Ocultado (tem DFD/protocolo): não aparece para uso em documentos novos. */
  oculto: boolean;
};

export async function listarOrgaos(): Promise<OrgaoResumo[]> {
  return getDb()
    .select({
      id: orgaos.id,
      sigla: orgaos.sigla,
      nome: orgaos.nome,
      orgaoEntidade: orgaos.orgaoEntidade,
      ordem: orgaos.ordem,
      assinaturaUnica: orgaos.assinaturaUnica,
      numeroInteressado: orgaos.numeroInteressado,
      oculto: orgaos.oculto,
    })
    .from(orgaos)
    .orderBy(asc(orgaos.ordem), asc(orgaos.id));
}

/** Estrutura de UM órgão (para as travas de promover/rebaixar/dual). `propriaId` = a unidade
 * "própria" (o órgão funciona também como unidade), se houver; `filhas` = unidades comuns. */
export async function contarUnidadesDoOrgao(
  orgaoId: number,
): Promise<{ total: number; filhas: number; propriaId: number | null }> {
  const rows = await getDb()
    .select({ id: reparticoes.id, proprio: reparticoes.orgaoProprio })
    .from(reparticoes)
    .where(eq(reparticoes.orgaoId, orgaoId));
  const propria = rows.find((r) => r.proprio);
  return { total: rows.length, filhas: rows.filter((r) => !r.proprio).length, propriaId: propria?.id ?? null };
}

/** Mapa `orgaoId → {tambemUnidade, temUnidades}` para a LISTA de órgãos (badges + travas na UI).
 * `tambemUnidade` = tem unidade própria (dual); `temUnidades` = tem unidade FILHA comum. */
export type EstruturaOrgao = { tambemUnidade: boolean; temUnidades: boolean };
export async function estruturaPorOrgao(): Promise<Record<number, EstruturaOrgao>> {
  const rows = await getDb()
    .select({
      orgaoId: reparticoes.orgaoId,
      proprias: sql<number>`SUM(CASE WHEN ${reparticoes.orgaoProprio} = 1 THEN 1 ELSE 0 END)`,
      filhas: sql<number>`SUM(CASE WHEN ${reparticoes.orgaoProprio} = 0 THEN 1 ELSE 0 END)`,
    })
    .from(reparticoes)
    .where(sql`${reparticoes.orgaoId} IS NOT NULL`)
    .groupBy(reparticoes.orgaoId);
  const out: Record<number, EstruturaOrgao> = {};
  for (const r of rows)
    if (r.orgaoId != null) out[r.orgaoId] = { tambemUnidade: Number(r.proprias) > 0, temUnidades: Number(r.filhas) > 0 };
  return out;
}

/**
 * Ponto 8 — o órgão tem DFD/protocolo vinculado? Direto (`orgao_id`) OU via as suas unidades
 * (`reparticao_id` ∈ unidades do órgão). Se sim, não pode ser excluído — só OCULTADO.
 */
export async function orgaoTemVinculo(orgaoId: number): Promise<boolean> {
  const db = getDb();
  const sub = sql`(SELECT id FROM reparticoes WHERE orgao_id = ${orgaoId})`;
  const [d] = await db
    .select({ n: sql<number>`1` })
    .from(dfds)
    .where(sql`(${dfds.orgaoId} = ${orgaoId}) OR (${dfds.reparticaoId} IN ${sub})`)
    .limit(1);
  if (d) return true;
  const [p] = await db
    .select({ n: sql<number>`1` })
    .from(dfdProtocolos)
    .where(sql`(${dfdProtocolos.orgaoId} = ${orgaoId}) OR (${dfdProtocolos.reparticaoId} IN ${sub})`)
    .limit(1);
  return !!p;
}

/**
 * Ponto 3 — o `numero_interessado` é ÚNICO GLOBAL entre órgãos E unidades. Devolve `true` se já
 * estiver em uso por OUTRO órgão ou unidade (excetuando o que está sendo editado).
 */
export async function numeroInteressadoEmUso(
  numero: string | null | undefined,
  exceto: { orgaoId?: number; reparticaoId?: number } = {},
): Promise<boolean> {
  const n = (numero ?? "").trim();
  if (!n) return false;
  const db = getDb();
  const [o] = await db
    .select({ id: orgaos.id })
    .from(orgaos)
    .where(exceto.orgaoId != null ? and(eq(orgaos.numeroInteressado, n), ne(orgaos.id, exceto.orgaoId)) : eq(orgaos.numeroInteressado, n))
    .limit(1);
  if (o) return true;
  const [u] = await db
    .select({ id: reparticoes.id })
    .from(reparticoes)
    .where(exceto.reparticaoId != null ? and(eq(reparticoes.numeroInteressado, n), ne(reparticoes.id, exceto.reparticaoId)) : eq(reparticoes.numeroInteressado, n))
    .limit(1);
  return !!u;
}
