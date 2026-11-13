import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { dfds } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { comandosHistoricoCenti } from "@/lib/conferencia-centi-sql";
import { conferenciaDesatualizada } from "@/lib/conferencia-dfd-centi";
import { getDb } from "@/lib/db";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

const LOTE = 50;

const corpoSchema = z.strictObject({
  itens: z
    .array(z.strictObject({ dfdId: z.number().int().positive(), status: z.enum(["convergente", "divergente"]), motivo: z.string().max(20_000).optional() }))
    .min(1)
    .max(5000),
});

/** Marca cada DFD como CONVERGENTE ou DIVERGENTE em relação à CM002 da Centi (o nó "Marcar conferência" dos fluxos). */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(corpoSchema, req);
  if ("resp" in p) return p.resp;
  const em = new Date().toISOString();
  const db = getDb();
  const unicos = [...new Map(p.data.itens.map((x) => [x.dfdId, x])).values()];
  // O que MUDA de fato (status ou motivo): só isso vai à auditoria. A "Conferir DFDs × Centi" marca UM DFD por pedido —
  // registrar todos geraria uma linha de histórico por DFD a cada execução (e recarregaria as telas de todos à toa).
  const antes = new Map<number, { s: string | null; m: string | null; em: string | null; at: string | null }>();
  // UMA consulta (os ids num parâmetro JSON — o limite de consultas por requisição do Worker).
  for (const r of await db
    .select({ id: dfds.id, s: dfds.conferenciaCenti, m: dfds.conferenciaCentiMotivo, em: dfds.conferenciaCentiEm, at: dfds.atualizadoEm })
    .from(dfds)
    .where(sql`${dfds.id} IN (SELECT value FROM json_each(${JSON.stringify(unicos.map((x) => x.dfdId))}))`))
    antes.set(r.id, { s: r.s, m: r.m, em: r.em, at: r.at });
  const mudou = unicos.filter((x) => {
    const a = antes.get(x.dfdId);
    return a && (a.s !== x.status || (a.m ?? null) !== (x.status === "divergente" ? (x.motivo ?? null) : null));
  });
  // A conferência que estava DESATUALIZADA (o DFD mudou depois dela) e volta igual também renova a versão dos dados —
  // senão a Mesa seguiria mostrando "Reconferir" pela lista memorizada.
  const renovados = unicos.filter((x) => {
    const a = antes.get(x.dfdId);
    return a && !mudou.includes(x) && conferenciaDesatualizada(a.em, a.at);
  });
  for (let i = 0; i < unicos.length; i += LOTE) {
    const fatia = unicos.slice(i, i + LOTE).map((x) =>
      db
        .update(dfds)
        .set({ conferenciaCenti: x.status, conferenciaCentiMotivo: x.status === "divergente" ? (x.motivo ?? null) : null, conferenciaCentiEm: em })
        .where(eq(dfds.id, x.dfdId)),
    );
    await db.batch(fatia as [(typeof fatia)[number], ...typeof fatia]);
  }
  // O HISTÓRICO: uma linha por DFD cujo resultado MUDOU; ficam as 20 mais recentes de cada um.
  if (mudou.length) {
    const cmds = comandosHistoricoCenti(
      db,
      mudou.map((x) => ({ dfdId: x.dfdId, status: x.status, motivo: x.status === "divergente" ? (x.motivo ?? null) : null, em, porNome: g.u.nome ?? null })),
    );
    await db.batch(cmds as [(typeof cmds)[number], ...typeof cmds]);
  }
  const div = unicos.filter((x) => x.status === "divergente").length;
  if (mudou.length || renovados.length) {
    const divM = mudou.filter((x) => x.status === "divergente").length;
    await registrarAuditoria({
      usuario: g.u,
      acao: "importar",
      entidade: "automacao",
      origem: "centi",
      resumo: mudou.length
        ? `Conferência dos DFDs × Centi: ${mudou.length} DFD(s) mudaram — ${mudou.length - divM} convergente(s) · ${divM} divergente(s)`
        : `Conferência dos DFDs × Centi: ${renovados.length} DFD(s) reconferido(s), sem mudança`,
    });
  }
  return ok({ marcados: unicos.length, alterados: mudou.length, convergentes: unicos.length - div, divergentes: div, em });
}
