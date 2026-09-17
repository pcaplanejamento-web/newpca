import { eq, inArray, sql } from "drizzle-orm";
import { dfdProtocolos, dfds, orgaos, reparticoes } from "@/db/schema";
import { getDb } from "./db";
import { RESPONSAVEIS_VAZIO, type Responsaveis, responsaveisEfetivos } from "./reparticao-responsaveis";

/**
 * Acesso aos RESPONSÁVEIS por DFDs das repartições (coluna `responsavel_dfd`, JSON).
 * Separado de `grupos.ts` (que só devolve `{id,codigo,nome}`) — usado para conferir
 * a assinatura no servidor (gravação) e para enriquecer os banners no cliente.
 * Só escopo de request (usa `getDb`).
 */

/**
 * Responsáveis EFETIVOS de UMA unidade (para conferir a assinatura no servidor); vazio se não
 * houver. Resolve a fonte: órgão em "assinatura única" → os do órgão; senão os da unidade.
 */
export async function carregarResponsaveis(reparticaoId: number | null | undefined): Promise<Responsaveis> {
  if (reparticaoId == null) return RESPONSAVEIS_VAZIO;
  const [r] = await getDb()
    .select({
      unidadeRaw: reparticoes.responsavelDfd,
      assinaturaUnica: orgaos.assinaturaUnica,
      orgaoRaw: orgaos.responsavelDfd,
    })
    .from(reparticoes)
    .leftJoin(orgaos, eq(reparticoes.orgaoId, orgaos.id))
    .where(eq(reparticoes.id, reparticaoId))
    .limit(1);
  if (!r) return RESPONSAVEIS_VAZIO;
  return responsaveisEfetivos({ assinaturaUnica: r.assinaturaUnica ?? false, orgaoRaw: r.orgaoRaw, unidadeRaw: r.unidadeRaw });
}

/** Mapa `reparticaoId → Responsaveis` EFETIVOS (enriquece a lista de unidades dos banners). */
export async function responsaveisPorReparticao(ids: number[]): Promise<Record<number, Responsaveis>> {
  const uniq = [...new Set(ids)].filter((n) => Number.isInteger(n));
  if (uniq.length === 0) return {};
  const linhas = await getDb()
    .select({
      id: reparticoes.id,
      unidadeRaw: reparticoes.responsavelDfd,
      assinaturaUnica: orgaos.assinaturaUnica,
      orgaoRaw: orgaos.responsavelDfd,
    })
    .from(reparticoes)
    .leftJoin(orgaos, eq(reparticoes.orgaoId, orgaos.id))
    .where(inArray(reparticoes.id, uniq));
  const out: Record<number, Responsaveis> = {};
  for (const l of linhas)
    out[l.id] = responsaveisEfetivos({ assinaturaUnica: l.assinaturaUnica ?? false, orgaoRaw: l.orgaoRaw, unidadeRaw: l.unidadeRaw });
  return out;
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
  oculto: boolean;
};

export async function dadosMatchPorReparticao(ids: number[]): Promise<Record<number, DadosMatchReparticao>> {
  const uniq = [...new Set(ids)].filter((n) => Number.isInteger(n));
  if (uniq.length === 0) return {};
  const linhas = await getDb()
    .select({
      id: reparticoes.id,
      numeroInteressado: reparticoes.numeroInteressado,
      setorRequisitante: reparticoes.setorRequisitante,
      orgaoId: reparticoes.orgaoId,
      oculto: reparticoes.oculto,
    })
    .from(reparticoes)
    .where(inArray(reparticoes.id, uniq));
  const out: Record<number, DadosMatchReparticao> = {};
  for (const l of linhas)
    out[l.id] = { numeroInteressado: l.numeroInteressado, setorRequisitante: l.setorRequisitante, orgaoId: l.orgaoId, oculto: l.oculto };
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
