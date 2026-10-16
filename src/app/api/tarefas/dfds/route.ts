import { inArray } from "drizzle-orm";
import { z } from "zod";
import { dfds } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { ok, parseCorpo } from "@/lib/http";
import { lotesDeIds } from "@/lib/reparticoes";
import { itemDoVinculo } from "@/lib/tarefas-core";

export const dynamic = "force-dynamic";

const id = z.number().int().positive();
const schema = z.object({ vinculos: z.array(z.object({ tipo: z.enum(["protocolo", "dfd", "item"]), id })).max(5000) });

/**
 * Os DFDs das tarefas (pelos vínculos: o protocolo = todos os DFDs dele; o DFD; o item = o DFD dele) — a entrada das
 * automações ("Emitir DFDs") a partir da lista de tarefas filtrada. Só o ADM (as automações são dele).
 */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(schema, req);
  if ("resp" in p) return p.resp;
  const protocolos = [...new Set(p.data.vinculos.filter((v) => v.tipo === "protocolo").map((v) => v.id))];
  const ids = [...new Set(p.data.vinculos.filter((v) => v.tipo !== "protocolo").map((v) => (v.tipo === "item" ? itemDoVinculo(v.id).dfdId : v.id)))];
  const db = getDb();
  const col = { id: dfds.id, numero: dfds.numero, planejamento: dfds.planejamento };
  const linhas = (
    await Promise.all([
      ...lotesDeIds(ids).map((l) => db.select(col).from(dfds).where(inArray(dfds.id, l))),
      ...lotesDeIds(protocolos).map((l) => db.select(col).from(dfds).where(inArray(dfds.protocoloId, l))),
    ])
  ).flat();
  const unicos = new Map(linhas.map((d) => [d.id, { id: d.id, numero: d.numero, planejamento: d.planejamento ?? "" }]));
  return ok({ dfds: [...unicos.values()] });
}
