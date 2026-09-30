import { inArray } from "drizzle-orm";
import { cache } from "react";
import { dfdProtocolos } from "@/db/schema";
import { type Acesso, getAcesso, visaoDoAcesso } from "./acesso";
import { getDb } from "./db";
import { type UnidadesDaSessao, unidadesDaSessao } from "./grupos";
import { consultaMeusDfds, consultaMeusProtocolos } from "./linhas-sql";
import type { VisaoMesa } from "./mesa-visao-core";
import { lotesDeIds } from "./reparticoes";

/**
 * ACESSO aos recursos da MESA (protocolos, DFDs e itens) pelo escopo de UNIDADES. Um DFD é LEGÍVEL quando a unidade DELE
 * está no escopo OU a do PROTOCOLO dele (o protocolo mostra todos os seus DFDs — antes o detalhe do DFD não conferia
 * nada: dava para ler, pelo id, a matrícula, o e-mail, o telefone e as assinaturas de qualquer DFD).
 */

type Acessivel = (reparticaoId: number | null | undefined) => boolean;

/** A unidade e o PCA de cada protocolo (id → {rep, pcaId}), em lotes de ≤ 90 ids. */
async function dadosDosProtocolos(ids: (number | null | undefined)[]): Promise<Map<number, { rep: number | null; pcaId: number | null }>> {
  const out = new Map<number, { rep: number | null; pcaId: number | null }>();
  const alvo = [...new Set(ids.filter((x): x is number => typeof x === "number" && x > 0))];
  for (const lote of lotesDeIds(alvo)) {
    const linhas = await getDb()
      .select({ id: dfdProtocolos.id, rep: dfdProtocolos.reparticaoId, pcaId: dfdProtocolos.pcaId })
      .from(dfdProtocolos)
      .where(inArray(dfdProtocolos.id, lote));
    for (const l of linhas) out.set(l.id, { rep: l.rep, pcaId: l.pcaId });
  }
  return out;
}

/** O PCA de cada protocolo (id → `pca_id`; `null` = na Mesa do sistema) — a Mesa em que ele e os DFDs dele estão
 * (`telaDoRecurso`/`podeNoRecurso`). Protocolo inexistente fica fora do mapa. */
export async function pcaDosProtocolos(ids: (number | null | undefined)[]): Promise<Map<number, number | null>> {
  return new Map([...(await dadosDosProtocolos(ids))].map(([id, d]) => [id, d.pcaId]));
}

/** Os DFDs que a pessoa pode LER (a unidade do DFD ou a do protocolo dele no escopo), na mesma ordem. */
export async function dfdsLegiveis<T extends { reparticaoId: number | null; protocoloId: number | null }>(acessivel: Acessivel, dfds: T[]): Promise<T[]> {
  const pendentes = dfds.filter((d) => !acessivel(d.reparticaoId) && d.protocoloId != null).map((d) => d.protocoloId);
  const reps = pendentes.length ? await dadosDosProtocolos(pendentes) : new Map<number, { rep: number | null; pcaId: number | null }>();
  return dfds.filter((d) => {
    if (acessivel(d.reparticaoId)) return true;
    const p = d.protocoloId != null ? reps.get(d.protocoloId) : undefined;
    return !!p && acessivel(p.rep);
  });
}

/** O DFD é LEGÍVEL? (a unidade dele ou a do protocolo dele no escopo) */
export async function dfdLegivel(acessivel: Acessivel, dfd: { reparticaoId: number | null; protocoloId: number | null }): Promise<boolean> {
  return (await dfdsLegiveis(acessivel, [dfd])).length === 1;
}

// ---------------------------------------------------------------------------------------------------------------
// ESCOPO DA MESA por requisição: as UNIDADES (grupo) + as LINHAS ("só os meus", detalhe do papel) + a VISÃO do papel.
// ---------------------------------------------------------------------------------------------------------------

export type EscopoMesa = {
  acesso: Acesso;
  un: UnidadesDaSessao;
  /** A unidade está no escopo de acesso? (só a UNIDADE — a de destino de uma edição, as listas por unidade) */
  acessivel: Acessivel;
  /** Os detalhes do papel resolvidos para as Mesas. */
  vis: VisaoMesa;
  /** "Só os meus": os protocolos (Responsável ou quem protocolou) e os DFDs meus — `null` = todas as linhas. */
  meus: { protocolos: ReadonlySet<number>; dfds: ReadonlySet<number> } | null;
};

/** O recurso fora das LINHAS da pessoa responde como o de unidade sem acesso (não revela que existe). */
export const MSG_SEM_ACESSO_PROTOCOLO = "Sem acesso a este protocolo.";
export const MSG_SEM_ACESSO_DFD = "Sem acesso a este DFD.";

async function carregarMeus(usuarioId: number) {
  const db = getDb();
  const [ps, ds] = await Promise.all([consultaMeusProtocolos(db, usuarioId), consultaMeusDfds(db, usuarioId)]);
  return { protocolos: new Set(ps.map((r) => r.id)), dfds: new Set(ds.map((r) => r.id)) };
}

/** O escopo da Mesa de quem está logado (ou `null`) — memorizado POR REQUISIÇÃO (listas, detalhes e escritas leem o
 * mesmo). O Administrador vê todas as linhas (a visão dele não tem restrição). */
export const escopoMesa = cache(async (): Promise<EscopoMesa | null> => {
  const acesso = await getAcesso();
  if (!acesso) return null;
  const vis = visaoDoAcesso(acesso);
  const [un, meus] = await Promise.all([unidadesDaSessao(acesso.u), vis.linhas === "meus" ? carregarMeus(acesso.u.id) : null]);
  return { acesso, un, acessivel: un.acessivel, vis, meus };
});

/** O protocolo passa nas LINHAS da pessoa? (sem "só os meus", todos passam) */
export const protocoloNasLinhas = (e: EscopoMesa, id: number) => !e.meus || e.meus.protocolos.has(id);
/** O DFD passa nas LINHAS da pessoa? */
export const dfdNasLinhas = (e: EscopoMesa, id: number) => !e.meus || e.meus.dfds.has(id);

/** O protocolo é LEGÍVEL: a unidade no escopo **e** nas linhas da pessoa. */
export const protocoloLegivel = (e: EscopoMesa, p: { id: number; reparticaoId: number | null }) => e.acessivel(p.reparticaoId) && protocoloNasLinhas(e, p.id);

/** Os DFDs LEGÍVEIS: a regra da unidade (a do DFD ou a do protocolo dele) **e** as linhas da pessoa, na mesma ordem. */
export async function dfdsLegiveisNaMesa<T extends { id: number; reparticaoId: number | null; protocoloId: number | null }>(e: EscopoMesa, dfds: T[]): Promise<T[]> {
  const naLinha = e.meus ? dfds.filter((d) => dfdNasLinhas(e, d.id)) : dfds;
  return dfdsLegiveis(e.acessivel, naLinha);
}

/** O DFD é LEGÍVEL? */
export async function dfdLegivelNaMesa(e: EscopoMesa, dfd: { id: number; reparticaoId: number | null; protocoloId: number | null }): Promise<boolean> {
  return (await dfdsLegiveisNaMesa(e, [dfd])).length === 1;
}
