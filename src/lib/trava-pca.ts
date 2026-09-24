import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { dfdProtocolos, dfds, pcas } from "@/db/schema";
import { getDb } from "./db";
import { erro } from "./http";
import { mensagemTravaPca } from "./pca-core";
import { lotesDeIds } from "./reparticoes";

/**
 * TRAVA do PCA no servidor: um protocolo INCORPORADO a um PCA (`pca_incorporado_em` ≠ null) trava o próprio
 * protocolo, os DFDs dele e os itens desses DFDs. Toda rota que escreve protocolo/DFD/item consulta aqui
 * ANTES de gravar e responde **423** com a mensagem única (`mensagemTravaPca`). A regra pura (o que passa
 * mesmo travado — a gestão) fica em `pca-core.ts`.
 */

export type TravaPca = { pcaId: number; nome: string };

/** Protocolos que estão em um PCA — ENVIADOS ou INCORPORADOS — entre os ids dados: `protocoloId → {pcaId, nome,
 * pcaIncorporadoEm}` (a regra de exclusão `motivoNaoExcluirProtocolo` decide o que isso impede). */
export async function pcaDeProtocolos(
  ids: (number | null | undefined)[],
): Promise<Map<number, TravaPca & { pcaIncorporadoEm: string | null }>> {
  const m = new Map<number, TravaPca & { pcaIncorporadoEm: string | null }>();
  const alvo = ids.filter((x): x is number => typeof x === "number" && x > 0);
  for (const lote of lotesDeIds(alvo)) {
    const rows = await getDb()
      .select({ id: dfdProtocolos.id, pcaId: dfdProtocolos.pcaId, nome: pcas.nome, pcaIncorporadoEm: dfdProtocolos.pcaIncorporadoEm })
      .from(dfdProtocolos)
      .innerJoin(pcas, eq(dfdProtocolos.pcaId, pcas.id))
      .where(inArray(dfdProtocolos.id, lote));
    for (const r of rows) if (r.pcaId != null) m.set(r.id, { pcaId: r.pcaId, nome: r.nome, pcaIncorporadoEm: r.pcaIncorporadoEm });
  }
  return m;
}

/** Protocolos travados entre os ids dados — `protocoloId → {pcaId, nome}`. */
export async function travaDeProtocolos(ids: (number | null | undefined)[]): Promise<Map<number, TravaPca>> {
  const m = new Map<number, TravaPca>();
  const alvo = ids.filter((x): x is number => typeof x === "number" && x > 0);
  for (const lote of lotesDeIds(alvo)) {
    const rows = await getDb()
      .select({ id: dfdProtocolos.id, pcaId: dfdProtocolos.pcaId, nome: pcas.nome })
      .from(dfdProtocolos)
      .innerJoin(pcas, eq(dfdProtocolos.pcaId, pcas.id))
      .where(and(inArray(dfdProtocolos.id, lote), isNotNull(dfdProtocolos.pcaIncorporadoEm)));
    for (const r of rows) if (r.pcaId != null) m.set(r.id, { pcaId: r.pcaId, nome: r.nome });
  }
  return m;
}

/** DFDs travados (pelo protocolo de origem incorporado) entre os ids dados — `dfdId → {pcaId, nome}`. */
export async function travaDeDfds(ids: (number | null | undefined)[]): Promise<Map<number, TravaPca>> {
  const m = new Map<number, TravaPca>();
  const alvo = ids.filter((x): x is number => typeof x === "number" && x > 0);
  for (const lote of lotesDeIds(alvo)) {
    const rows = await getDb()
      .select({ id: dfds.id, pcaId: dfdProtocolos.pcaId, nome: pcas.nome })
      .from(dfds)
      .innerJoin(dfdProtocolos, eq(dfds.protocoloId, dfdProtocolos.id))
      .innerJoin(pcas, eq(dfdProtocolos.pcaId, pcas.id))
      .where(and(inArray(dfds.id, lote), isNotNull(dfdProtocolos.pcaIncorporadoEm)));
    for (const r of rows) if (r.pcaId != null) m.set(r.id, { pcaId: r.pcaId, nome: r.nome });
  }
  return m;
}

/** A trava de UM DFD (ou `null`). */
export async function travaDoDfd(id: number | null | undefined): Promise<TravaPca | null> {
  return id ? ((await travaDeDfds([id])).get(id) ?? null) : null;
}

/** Resposta 423 padrão da trava. */
export function respostaTravado(t: TravaPca) {
  return erro(mensagemTravaPca(t.nome), 423);
}
