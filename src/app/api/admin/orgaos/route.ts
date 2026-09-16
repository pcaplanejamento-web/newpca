import { asc, sql } from "drizzle-orm";
import { orgaos } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { ok, parseCorpo } from "@/lib/http";
import { orgaoSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const rows = await getDb()
    .select({
      id: orgaos.id,
      sigla: orgaos.sigla,
      nome: orgaos.nome,
      orgaoEntidade: orgaos.orgaoEntidade,
      ordem: orgaos.ordem,
    })
    .from(orgaos)
    .orderBy(asc(orgaos.ordem), asc(orgaos.id));
  return ok({ orgaos: rows });
}

export async function POST(req: Request) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const corpo = await parseCorpo(orgaoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const db = getDb();
  const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${orgaos.ordem}), -1)` }).from(orgaos);
  const [row] = await db
    .insert(orgaos)
    .values({
      sigla: corpo.data.sigla,
      nome: corpo.data.nome,
      orgaoEntidade: corpo.data.orgaoEntidade ?? null,
      ordem: Number(max) + 1,
    })
    .returning({ id: orgaos.id });
  return ok({ id: row?.id });
}
