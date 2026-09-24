import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ok, parseCorpo } from "@/lib/http";
import { reordenarUnidadesMedida } from "@/lib/padronizacao";
import { ordemPadronizacaoSchema } from "@/lib/padronizacao-validation";

export const dynamic = "force-dynamic";

/** Nova ordem das unidades de medida (a da lista e dos seletores). */
export async function PATCH(req: Request) {
  const g = await exigirEditor();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(ordemPadronizacaoSchema, req);
  if ("resp" in p) return p.resp;
  await reordenarUnidadesMedida(p.data.ids);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "unidade_medida", resumo: `Unidades de medida reordenadas (${p.data.ids.length})`, depois: { ordem: p.data.ids } });
  return ok();
}
