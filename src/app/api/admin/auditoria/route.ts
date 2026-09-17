import { exigirAdmin } from "@/lib/api-auth";
import { listarAuditoria } from "@/lib/auditoria";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Listagem GLOBAL da auditoria (só ADM) — filtros (entidade/ação/usuário/período) + paginação. */
export async function GET(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const u = new URL(req.url);
  const page = Math.max(1, Number(u.searchParams.get("page")) || 1);
  const usuarioId = u.searchParams.get("usuarioId");
  const filtro = {
    entidade: u.searchParams.get("entidade") || undefined,
    acao: u.searchParams.get("acao") || undefined,
    usuarioId: usuarioId ? Number(usuarioId) : undefined,
    de: u.searchParams.get("de") || undefined,
    ate: u.searchParams.get("ate") || undefined,
  };
  const { linhas, total } = await listarAuditoria(filtro, page, 50);
  return ok({ linhas, total, page, pageSize: 50 });
}
