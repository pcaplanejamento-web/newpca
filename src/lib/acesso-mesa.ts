import { inArray } from "drizzle-orm";
import { dfdProtocolos } from "@/db/schema";
import { getDb } from "./db";
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
