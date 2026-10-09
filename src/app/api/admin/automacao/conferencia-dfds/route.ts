import { eq } from "drizzle-orm";
import { z } from "zod";
import { dfds } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

const LOTE = 50;

const corpoSchema = z.strictObject({
  itens: z
    .array(z.strictObject({ dfdId: z.number().int().positive(), status: z.enum(["convergente", "divergente"]), motivo: z.string().max(2000).optional() }))
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
  for (let i = 0; i < unicos.length; i += LOTE) {
    const fatia = unicos.slice(i, i + LOTE).map((x) =>
      db
        .update(dfds)
        .set({ conferenciaCenti: x.status, conferenciaCentiMotivo: x.status === "divergente" ? (x.motivo ?? null) : null, conferenciaCentiEm: em })
        .where(eq(dfds.id, x.dfdId)),
    );
    await db.batch(fatia as [(typeof fatia)[number], ...typeof fatia]);
  }
  const div = unicos.filter((x) => x.status === "divergente").length;
  await registrarAuditoria({
    usuario: g.u,
    acao: "importar",
    entidade: "automacao",
    origem: "centi",
    resumo: `Conferência dos DFDs com a CM002: ${unicos.length - div} convergente(s) · ${div} divergente(s)`,
  });
  return ok({ marcados: unicos.length, convergentes: unicos.length - div, divergentes: div, em });
}
