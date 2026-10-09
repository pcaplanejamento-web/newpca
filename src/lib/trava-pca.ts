import { eq, inArray } from "drizzle-orm";
import { dfdProtocolos, pcas } from "@/db/schema";
import { getDb } from "./db";
import { lotesDeIds } from "./reparticoes";

/**
 * O PCA em que estão os protocolos (ENVIADOS ou INCORPORADOS). Não há mais trava: o protocolo incorporado se edita, se
 * exclui e se devolve como qualquer outro — o PCA acompanha (`pca-sincronia.ts`). Fica só a recusa da FUSÃO por Id (a
 * re-importação que excluiria um protocolo em um PCA para passar os DFDs a outro — `POST /api/protocolo`).
 */

export type TravaPca = { pcaId: number; nome: string };

/** Protocolos que estão em um PCA — ENVIADOS ou INCORPORADOS — entre os ids dados: `protocoloId → {pcaId, nome,
 * pcaIncorporadoEm}`. */
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
