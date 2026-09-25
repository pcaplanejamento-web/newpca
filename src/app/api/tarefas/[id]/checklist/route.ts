import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { criarItemChecklist, tarefaAcessivel } from "@/lib/tarefas";
import { rotuloTicket } from "@/lib/tarefas-core";
import { checklistSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/** Acrescenta um item ao CHECKLIST da tarefa (no fim) — qualquer pessoa do grupo do quadro. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const r = id ? await tarefaAcessivel(a.u, id) : null;
  if (!id || !r) return erro("Tarefa não encontrada.", 404);
  const p = await parseCorpo(checklistSchema, req);
  if ("resp" in p) return p.resp;
  const itemId = await criarItemChecklist(id, p.data.texto);
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "tarefa", entidadeId: id, resumo: `Tarefa ${rotuloTicket(r.tarefa.ticket)}: item "${p.data.texto}" no checklist` });
  return ok({ id: itemId });
}
