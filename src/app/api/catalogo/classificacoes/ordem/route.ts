import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ok, parseCorpo } from "@/lib/http";
import { reordenarClassificacoes } from "@/lib/padronizacao";
import { reordenarSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

/** Nova ordem das classificações — desempata a classificação automática (mesma posição e mesmo tamanho). */
export async function PATCH(req: Request) {
  const g = await exigirEditor();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(reordenarSchema, req);
  if ("resp" in p) return p.resp;
  await reordenarClassificacoes(p.data.ids);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "classificacao_item", resumo: `Classificações reordenadas (${p.data.ids.length})`, depois: { ordem: p.data.ids } });
  return ok();
}
