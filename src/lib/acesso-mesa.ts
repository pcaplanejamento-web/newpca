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

/** As unidades dos protocolos (id → unidade), em lotes de ≤ 90 ids. */
async function unidadesDosProtocolos(ids: number[]): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>();
  for (const lote of lotesDeIds(ids)) {
    const linhas = await getDb().select({ id: dfdProtocolos.id, rep: dfdProtocolos.reparticaoId }).from(dfdProtocolos).where(inArray(dfdProtocolos.id, lote));
    for (const l of linhas) out.set(l.id, l.rep);
  }
  return out;
}

/** Os DFDs que a pessoa pode LER (a unidade do DFD ou a do protocolo dele no escopo), na mesma ordem. */
export async function dfdsLegiveis<T extends { reparticaoId: number | null; protocoloId: number | null }>(acessivel: Acessivel, dfds: T[]): Promise<T[]> {
  const pendentes = dfds.filter((d) => !acessivel(d.reparticaoId) && d.protocoloId != null).map((d) => d.protocoloId as number);
  const reps = pendentes.length ? await unidadesDosProtocolos(pendentes) : new Map<number, number | null>();
  return dfds.filter((d) => acessivel(d.reparticaoId) || (d.protocoloId != null && reps.has(d.protocoloId) && acessivel(reps.get(d.protocoloId))));
}

/** O DFD é LEGÍVEL? (a unidade dele ou a do protocolo dele no escopo) */
export async function dfdLegivel(acessivel: Acessivel, dfd: { reparticaoId: number | null; protocoloId: number | null }): Promise<boolean> {
  return (await dfdsLegiveis(acessivel, [dfd])).length === 1;
}
