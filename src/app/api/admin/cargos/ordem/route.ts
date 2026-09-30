import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { reordenarCargos } from "@/lib/cargos";
import { ok, parseCorpo } from "@/lib/http";
import { reordenarSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

/** Nova ordem dos cargos (a da lista do cadastro). */
export async function PATCH(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(reordenarSchema, req);
  if ("resp" in p) return p.resp;
  await reordenarCargos(p.data.ids);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "cargo", resumo: `Cargos/funções reordenados (${p.data.ids.length})`, depois: { ordem: p.data.ids } });
  return ok();
}
