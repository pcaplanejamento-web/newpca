import { asc, sql } from "drizzle-orm";
import { reparticoes } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { ok, parseCorpo } from "@/lib/http";
import { reparticaoSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const lista = await getDb()
    .select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome, ordem: reparticoes.ordem })
    .from(reparticoes)
    .orderBy(asc(reparticoes.ordem), asc(reparticoes.id));
  return ok({ reparticoes: lista });
}

export async function POST(req: Request) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const corpo = await parseCorpo(reparticaoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const db = getDb();
  const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${reparticoes.ordem}), -1)` }).from(reparticoes);
  const [row] = await db
    .insert(reparticoes)
    .values({ codigo: corpo.data.codigo, nome: corpo.data.nome, ordem: Number(max) + 1 })
    .returning({ id: reparticoes.id });
  return ok({ id: row?.id });
}
