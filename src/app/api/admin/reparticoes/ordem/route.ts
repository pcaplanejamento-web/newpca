import { eq, sql } from "drizzle-orm";
import { reparticoes } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { ok, parseCorpo } from "@/lib/http";
import { reordenarSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

/** Grava a nova ordem das repartições (índice = posição na lista). */
export async function PATCH(req: Request) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const corpo = await parseCorpo(reordenarSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const db = getDb();
  const { ids } = corpo.data;
  for (let i = 0; i < ids.length; i++) {
    await db
      .update(reparticoes)
      .set({ ordem: i, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
      .where(eq(reparticoes.id, ids[i]));
  }
  return ok();
}
