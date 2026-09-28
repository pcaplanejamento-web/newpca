import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { excluirChecklist, getChecklist, renomearChecklist, tarefaAcessivel } from "@/lib/tarefas";
import { rotuloTicket } from "@/lib/tarefas-core";
import { checklistNomeSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** O checklist, se o usuário vê a tarefa dele. */
async function checklistAcessivel(ctx: Ctx) {
  const a = await exigirUsuario();
  if ("erro" in a) return { resp: a.erro };
  const id = intId((await ctx.params).id);
  const c = id ? await getChecklist(id) : null;
  const r = c ? await tarefaAcessivel(a.u, c.tarefaId) : null;
  if (!c || !r) return { resp: erro("Checklist não encontrado.", 404) };
  return { u: a.u, c, r };
}

/** Renomeia o checklist. */
export async function PATCH(req: Request, ctx: Ctx) {
  const x = await checklistAcessivel(ctx);
  if ("resp" in x) return x.resp;
  const p = await parseCorpo(checklistNomeSchema, req);
  if ("resp" in p) return p.resp;
  await renomearChecklist(x.c.id, p.data.nome);
  await registrarAuditoria({ usuario: x.u, acao: "editar", entidade: "tarefa", entidadeId: x.r.tarefa.id, resumo: `Tarefa ${rotuloTicket(x.r.tarefa.ticket)}: checklist "${x.c.nome}" renomeado para "${p.data.nome}"` });
  return ok();
}

/** Exclui o checklist e os itens dele. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const x = await checklistAcessivel(ctx);
  if ("resp" in x) return x.resp;
  await excluirChecklist(x.c.id);
  await registrarAuditoria({ usuario: x.u, acao: "editar", entidade: "tarefa", entidadeId: x.r.tarefa.id, resumo: `Tarefa ${rotuloTicket(x.r.tarefa.ticket)}: checklist "${x.c.nome}" excluído` });
  return ok();
}
