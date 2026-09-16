import { asc, sql } from "drizzle-orm";
import { orgaos } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { ok, parseCorpo } from "@/lib/http";
import { parseResponsaveis, serializeResponsaveis } from "@/lib/reparticao-responsaveis";
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
      assinaturaUnica: orgaos.assinaturaUnica,
      responsavelDfd: orgaos.responsavelDfd,
    })
    .from(orgaos)
    .orderBy(asc(orgaos.ordem), asc(orgaos.id));
  // A coluna guarda JSON; expõe como `responsaveis`.
  const lista = rows.map(({ responsavelDfd, ...o }) => ({ ...o, responsaveis: parseResponsaveis(responsavelDfd) }));
  return ok({ orgaos: lista });
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
      assinaturaUnica: corpo.data.assinaturaUnica,
      responsavelDfd: serializeResponsaveis(corpo.data.responsaveis),
      ordem: Number(max) + 1,
    })
    .returning({ id: orgaos.id });
  return ok({ id: row?.id });
}
