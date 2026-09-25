import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atualizarItemChecklist, excluirItemChecklist, getItemChecklist, tarefaAcessivel } from "@/lib/tarefas";
import { rotuloTicket } from "@/lib/tarefas-core";
import { editarChecklistSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

/** O item do checklist DESTA tarefa, se o usuário vê a tarefa. */
async function itemDaTarefa(ctx: Ctx) {
  const a = await exigirUsuario();
  if ("erro" in a) return { resp: a.erro };
  const ps = await ctx.params;
  const id = intId(ps.id);
  const itemId = intId(ps.itemId);
  const r = id ? await tarefaAcessivel(a.u, id) : null;
  const item = r && itemId ? await getItemChecklist(itemId) : null;
  if (!r || !item || item.tarefaId !== r.tarefa.id) return { resp: erro("Item não encontrado.", 404) };
  return { u: a.u, r, item };
}

/** Marca/desmarca, renomeia ou reordena (vizinhos) o item. */
export async function PATCH(req: Request, ctx: Ctx) {
  const x = await itemDaTarefa(ctx);
  if ("resp" in x) return x.resp;
  const p = await parseCorpo(editarChecklistSchema, req);
  if ("resp" in p) return p.resp;
  await atualizarItemChecklist(x.item, p.data);
  if (p.data.feito != null || p.data.texto != null)
    await registrarAuditoria({
      usuario: x.u,
      acao: "editar",
      entidade: "tarefa",
      entidadeId: x.r.tarefa.id,
      resumo: `Tarefa ${rotuloTicket(x.r.tarefa.ticket)}: item "${p.data.texto ?? x.item.texto}" ${p.data.feito === true ? "concluído" : p.data.feito === false ? "reaberto" : "renomeado"}`,
    });
  return ok();
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const x = await itemDaTarefa(ctx);
  if ("resp" in x) return x.resp;
  await excluirItemChecklist(x.item.id);
  await registrarAuditoria({ usuario: x.u, acao: "editar", entidade: "tarefa", entidadeId: x.r.tarefa.id, resumo: `Tarefa ${rotuloTicket(x.r.tarefa.ticket)}: item "${x.item.texto}" removido do checklist` });
  return ok();
}
