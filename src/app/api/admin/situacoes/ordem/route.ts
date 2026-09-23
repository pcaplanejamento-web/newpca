import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ok, parseCorpo } from "@/lib/http";
import { reordenarSchema } from "@/lib/rbac-validation";
import { reordenarSituacoes } from "@/lib/situacoes";

export const dynamic = "force-dynamic";

/** Nova ordem das situações (a do dropdown da célula "Situação" na Mesa). */
export async function PATCH(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(reordenarSchema, req);
  if ("resp" in p) return p.resp;
  await reordenarSituacoes(p.data.ids);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "situacao_protocolo", resumo: `Situações reordenadas (${p.data.ids.length})`, depois: { ordem: p.data.ids } });
  return ok();
}
