import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { criarEtiqueta, quadroAcessivel } from "@/lib/tarefas";
import { etiquetaSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/** Cria uma ETIQUETA do quadro (nome + cor). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const q = id ? await quadroAcessivel(a.u, id) : null;
  if (!q) return erro("Quadro não encontrado.", 404);
  const p = await parseCorpo(etiquetaSchema, req);
  if ("resp" in p) return p.resp;
  const eid = await criarEtiqueta(q.id, p.data);
  await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "tarefa_etiqueta", entidadeId: eid, resumo: `Etiqueta "${p.data.nome}" criada no quadro "${q.nome}"` });
  return ok({ id: eid });
}
