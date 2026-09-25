import { eq, inArray } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { dfdProtocolos, dfds } from "../db/schema.ts";

type Db = DrizzleD1Database<typeof schema>;

/**
 * Protocolo de MESMO Id (capa) e nº DIFERENTE = o MESMO processo, renumerado (dedup por Id — não coexistem dois
 * protocolos com o mesmo Id). Os comandos que vão ANTES do upsert pelo nº, no MESMO lote (atômico):
 * - sem outro protocolo com o nº novo (`alvoId` null): o de mesmo Id é RENUMERADO — o mesmo registro, então os DFDs, a
 *   gestão (responsável/situação/distribuição), o histórico e o rastro seguem; o upsert em seguida atualiza a capa;
 * - com outro protocolo já usando o nº novo (ou mais de um de mesmo Id, legado): os DFDs dos demais passam ao que fica
 *   e eles saem — nunca deixa DFD órfão (a FK `set null` orfanava os que não vinham no PDF e os mantidos).
 * BUILDERS do Drizzle (nada de `db.run(sql…)` em `db.batch`) — testados pelo driver D1 real.
 */
export function comandosMesmoId(db: Db, numero: string, mesmoId: number[], alvoId: number | null) {
  if (mesmoId.length === 0) return [];
  const fica = alvoId ?? mesmoId[0];
  const saem = mesmoId.filter((id) => id !== fica);
  return [
    ...(alvoId == null ? [db.update(dfdProtocolos).set({ numero }).where(eq(dfdProtocolos.id, fica))] : []),
    ...(saem.length > 0
      ? [db.update(dfds).set({ protocoloId: fica }).where(inArray(dfds.protocoloId, saem)), db.delete(dfdProtocolos).where(inArray(dfdProtocolos.id, saem))]
      : []),
  ];
}
