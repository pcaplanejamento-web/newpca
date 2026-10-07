import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { dfdProtocolos, dfds, orgaos, reparticoes } from "@/db/schema";
import { getDb } from "./db";
import { RESPONSAVEIS_VAZIO, type Responsaveis } from "./reparticao-responsaveis";
import { alvoEfetivo, responsaveisEfetivosDasUnidades } from "./responsaveis-planilha-core";
import { consultaVinculosDosAlvos, linhaVinculo } from "./responsaveis-sql";

/**
 * Acesso aos RESPONSÁVEIS por DFDs das unidades — os VÍNCULOS da planilha única (`responsaveis` +
 * `responsaveis_vinculos`, migração 0099), montados no MESMO `Responsaveis` de sempre. Usado para conferir a
 * assinatura no servidor (gravação) e para enriquecer os banners no cliente. Só escopo de request (usa `getDb`).
 */

/** Ids únicos válidos em LOTES de ≤ 90 (folga sob o limite de 100 parâmetros por statement do D1). */
export function lotesDeIds(ids: number[]): number[][] {
  const uniq = [...new Set(ids)].filter((n) => Number.isInteger(n));
  const out: number[][] = [];
  for (let i = 0; i < uniq.length; i += 90) out.push(uniq.slice(i, i + 90));
  return out;
}

/** Mapa `reparticaoId → Responsaveis` EFETIVOS: órgão em "assinatura única" → os do órgão; senão os da unidade. Duas
 * consultas para qualquer quantidade (os ids num parâmetro JSON). */
export async function responsaveisPorReparticao(ids: number[]): Promise<Record<number, Responsaveis>> {
  const uniq = [...new Set(ids)].filter((n) => Number.isInteger(n));
  if (uniq.length === 0) return {};
  const db = getDb();
  const unidades = await db
    .select({ id: reparticoes.id, orgaoId: reparticoes.orgaoId, assinaturaUnica: orgaos.assinaturaUnica })
    .from(reparticoes)
    .leftJoin(orgaos, eq(reparticoes.orgaoId, orgaos.id))
    .where(sql`${reparticoes.id} IN (SELECT value FROM json_each(${JSON.stringify(uniq)}))`);
  const lista = unidades.map((u) => ({ id: u.id, orgaoId: u.orgaoId, assinaturaUnica: u.assinaturaUnica ?? false }));
  const alvos = { orgaos: [] as number[], unidades: [] as number[] };
  for (const u of lista) {
    const a = alvoEfetivo({ reparticaoId: u.id, orgaoId: u.orgaoId, assinaturaUnica: u.assinaturaUnica });
    if ("orgaoId" in a) alvos.orgaos.push(a.orgaoId);
    else alvos.unidades.push(a.reparticaoId);
  }
  const vinculos = (await consultaVinculosDosAlvos(db, alvos)).map(linhaVinculo);
  return responsaveisEfetivosDasUnidades(lista, vinculos);
}

/** Responsáveis EFETIVOS de UMA unidade (para conferir a assinatura no servidor); vazio se não houver. */
export async function carregarResponsaveis(reparticaoId: number | null | undefined): Promise<Responsaveis> {
  if (reparticaoId == null) return RESPONSAVEIS_VAZIO;
  return (await responsaveisPorReparticao([reparticaoId]))[reparticaoId] ?? RESPONSAVEIS_VAZIO;
}

/** Órgão dono de UMA unidade (para o portão de divergência no servidor). `null` se não houver. */
export async function orgaoIdDaReparticao(reparticaoId: number | null | undefined): Promise<number | null> {
  if (reparticaoId == null) return null;
  const [r] = await getDb().select({ orgaoId: reparticoes.orgaoId }).from(reparticoes).where(eq(reparticoes.id, reparticaoId)).limit(1);
  return r?.orgaoId ?? null;
}

/** Campos de MATCH da unidade (interessado/setor/órgão) — threadados ao cliente p/ casar
 * Interessado do protocolo → unidade, Setor Requisitante do DFD → unidade e a divergência. */
export type DadosMatchReparticao = {
  numeroInteressado: string | null;
  setorRequisitante: string | null;
  orgaoId: number | null;
  orgaoProprio: boolean;
  oculto: boolean;
};

export async function dadosMatchPorReparticao(ids: number[]): Promise<Record<number, DadosMatchReparticao>> {
  const lotes = lotesDeIds(ids);
  if (lotes.length === 0) return {};
  const linhas = (
    await Promise.all(
      lotes.map((lote) =>
        getDb()
          .select({
            id: reparticoes.id,
            numeroInteressado: reparticoes.numeroInteressado,
            setorRequisitante: reparticoes.setorRequisitante,
            orgaoId: reparticoes.orgaoId,
            orgaoProprio: reparticoes.orgaoProprio,
            oculto: reparticoes.oculto,
          })
          .from(reparticoes)
          .where(inArray(reparticoes.id, lote)),
      ),
    )
  ).flat();
  const out: Record<number, DadosMatchReparticao> = {};
  for (const l of linhas)
    out[l.id] = {
      numeroInteressado: l.numeroInteressado,
      setorRequisitante: l.setorRequisitante,
      orgaoId: l.orgaoId,
      orgaoProprio: l.orgaoProprio,
      oculto: l.oculto,
    };
  return out;
}

/**
 * Ponto 8 — a unidade tem DFD/protocolo vinculado? (`reparticao_id` em `dfds` ou `dfd_protocolos`).
 * Se sim, não pode ser excluída — só OCULTADA (preserva o histórico, some do uso futuro).
 */
export async function unidadeTemVinculo(reparticaoId: number): Promise<boolean> {
  const db = getDb();
  const [d] = await db.select({ n: sql<number>`1` }).from(dfds).where(eq(dfds.reparticaoId, reparticaoId)).limit(1);
  if (d) return true;
  const [p] = await db.select({ n: sql<number>`1` }).from(dfdProtocolos).where(eq(dfdProtocolos.reparticaoId, reparticaoId)).limit(1);
  return !!p;
}

/** Unidade para a CONFERÊNCIA de DFDs (código/nome p/ exibir + órgão + responsáveis EFETIVOS). */
export type UnidadeConferencia = { id: number; codigo: string; nome: string; orgaoId: number | null; responsaveis: Responsaveis };

/**
 * Unidades REFERENCIADAS por DFDs (inclusive fora da lista do usuário — ex.: DFD de outra unidade num
 * protocolo acessível), com os responsáveis EFETIVOS: a conferência (assinatura/unidade) dos DFDs do
 * protocolo gravado e da lista da Mesa usa a unidade REAL do DFD, nunca "sem unidade" por falta de acesso.
 */
export async function unidadesConferencia(ids: (number | null | undefined)[]): Promise<UnidadeConferencia[]> {
  const lotes = lotesDeIds(ids.filter((n): n is number => n != null));
  if (lotes.length === 0) return [];
  const [linhas, resp] = await Promise.all([
    Promise.all(
      lotes.map((lote) =>
        getDb()
          .select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome, orgaoId: reparticoes.orgaoId })
          .from(reparticoes)
          .where(inArray(reparticoes.id, lote)),
      ),
    ),
    responsaveisPorReparticao(lotes.flat()),
  ]);
  return linhas.flat().map((l) => ({ ...l, responsaveis: resp[l.id] ?? RESPONSAVEIS_VAZIO }));
}

/** Uma unidade que se pode ESCOLHER como local de trabalho (cadastro, ADM): nem oculta nem a "Geral" virtual. */
export type UnidadeTrabalho = { id: number; codigo: string; nome: string; orgao: string | null };

/** As unidades de trabalho, agrupáveis pelo órgão (na ordem dos órgãos e, dentro deles, na das unidades). */
export async function listarUnidadesTrabalho(): Promise<UnidadeTrabalho[]> {
  return getDb()
    .select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome, orgao: orgaos.nome })
    .from(reparticoes)
    .leftJoin(orgaos, eq(orgaos.id, reparticoes.orgaoId))
    .where(and(eq(reparticoes.oculto, false), ne(reparticoes.codigo, "GERAL")))
    .orderBy(sql`${orgaos.ordem} IS NULL`, asc(orgaos.ordem), asc(reparticoes.ordem), asc(reparticoes.id));
}

/** A unidade pode ser escolhida como local de trabalho? */
export async function unidadeDeTrabalhoValida(id: number): Promise<boolean> {
  const [r] = await getDb()
    .select({ id: reparticoes.id })
    .from(reparticoes)
    .where(and(eq(reparticoes.id, id), eq(reparticoes.oculto, false), ne(reparticoes.codigo, "GERAL")))
    .limit(1);
  return !!r;
}
