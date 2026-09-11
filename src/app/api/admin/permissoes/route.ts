import { sql } from "drizzle-orm";
import { grupos, permissoes } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { ok, parseCorpo } from "@/lib/http";
import { permissaoSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

function parseAbas(s: string): string[] {
  try {
    const a: unknown = JSON.parse(s);
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const lista = await getDb()
    .select({
      id: permissoes.id,
      nome: permissoes.nome,
      abas: permissoes.abas,
      grupos: sql<number>`(SELECT COUNT(*) FROM ${grupos} WHERE ${grupos.permissaoId} = ${permissoes.id})`,
    })
    .from(permissoes)
    .orderBy(permissoes.nome);
  return ok({
    permissoes: lista.map((p) => ({ id: p.id, nome: p.nome, abas: parseAbas(p.abas), grupos: Number(p.grupos) })),
  });
}

export async function POST(req: Request) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const corpo = await parseCorpo(permissaoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const [row] = await getDb()
    .insert(permissoes)
    .values({ nome: corpo.data.nome, abas: JSON.stringify(corpo.data.abas) })
    .returning({ id: permissoes.id });
  return ok({ id: row?.id });
}
