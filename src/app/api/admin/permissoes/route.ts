import { sql } from "drizzle-orm";
import { grupos, permissoes } from "@/db/schema";
import { abasConhecidas } from "@/lib/abas";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { ok, parseCorpo } from "@/lib/http";
import { permissaoSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

/** As abas gravadas que EXISTEM (a de um módulo removido some — o editor não a reenvia e o salvar não falha). */
function parseAbas(s: string): string[] {
  try {
    return abasConhecidas(JSON.parse(s));
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
  await registrarAuditoria({ usuario: guard.u, acao: "criar", entidade: "permissao", entidadeId: row?.id ?? null, resumo: `Permissão "${corpo.data.nome}" criada`, depois: { nome: corpo.data.nome, abas: corpo.data.abas } });
  return ok({ id: row?.id });
}
