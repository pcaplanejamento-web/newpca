import { isNotNull } from "drizzle-orm";
import { dfdProtocolos, dfds, pcas } from "@/db/schema";
import type { ProtocoloAutomacao } from "./automacao-centi-core";
import { getDb } from "./db";

/** Os protocolos do sistema com os planejamentos dos DFDs deles (a tela Automação, só ADM — todas as unidades). Duas
 * consultas enxutas; o agrupamento é feito aqui. */
export async function protocolosParaAutomacao(): Promise<ProtocoloAutomacao[]> {
  const db = getDb();
  const [protos, lista, planos] = await Promise.all([
    db
      .select({
        id: dfdProtocolos.id,
        numero: dfdProtocolos.numero,
        idExterno: dfdProtocolos.idExterno,
        assunto: dfdProtocolos.assunto,
        interessado: dfdProtocolos.interessado,
        anoPca: dfdProtocolos.anoPca,
        pcaId: dfdProtocolos.pcaId,
      })
      .from(dfdProtocolos),
    db.select({ protocoloId: dfds.protocoloId, numero: dfds.numero, planejamento: dfds.planejamento }).from(dfds).where(isNotNull(dfds.protocoloId)),
    db.select({ id: pcas.id, nome: pcas.nome }).from(pcas),
  ]);
  const nomePca = new Map(planos.map((p) => [p.id, p.nome]));
  const porProto = new Map<number, ProtocoloAutomacao["dfds"]>();
  for (const d of lista) {
    if (d.protocoloId == null) continue;
    const arr = porProto.get(d.protocoloId) ?? [];
    arr.push({ numero: d.numero, planejamento: d.planejamento ?? null });
    porProto.set(d.protocoloId, arr);
  }
  return protos
    .map((p) => ({
      id: p.id,
      numero: p.numero,
      idExterno: p.idExterno ?? null,
      assunto: p.assunto ?? null,
      interessado: p.interessado ?? null,
      anoPca: p.anoPca ?? null,
      pca: p.pcaId != null ? (nomePca.get(p.pcaId) ?? null) : null,
      dfds: (porProto.get(p.id) ?? []).sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true })),
    }))
    .sort((a, b) => b.id - a.id);
}
