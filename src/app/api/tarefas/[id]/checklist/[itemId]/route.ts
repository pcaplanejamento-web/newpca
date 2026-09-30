import { exigirSessao, intId, recusaNoQuadro } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atualizarItemChecklist, avisarSobreTarefa, excluirItemChecklist, getItemChecklist, pessoasValidas, tarefaAcessivel } from "@/lib/tarefas";
import { rotuloTicket } from "@/lib/tarefas-core";
import { editarChecklistSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

/** O item do checklist DESTA tarefa, se o usuário vê a tarefa. */
async function itemDaTarefa(ctx: Ctx) {
  const a = await exigirSessao();
  if ("erro" in a) return { resp: a.erro };
  const ps = await ctx.params;
  const id = intId(ps.id);
  const itemId = intId(ps.itemId);
  const r = id ? await tarefaAcessivel(a.u, id) : null;
  const item = r && itemId ? await getItemChecklist(itemId) : null;
  if (!r || !item || item.tarefaId !== r.tarefa.id) return { resp: erro("Item não encontrado.", 404) };
  const negado = recusaNoQuadro(a.acesso, r.quadro, "manipular", true);
  if (negado) return { resp: negado };
  return { u: a.u, r, item };
}

/** Marca/desmarca, renomeia, reordena (vizinhos) ou muda o PRAZO/RESPONSÁVEL do item (pessoa do grupo do quadro). */
export async function PATCH(req: Request, ctx: Ctx) {
  const x = await itemDaTarefa(ctx);
  if ("resp" in x) return x.resp;
  const p = await parseCorpo(editarChecklistSchema, req);
  if ("resp" in p) return p.resp;
  const { responsavelId } = p.data;
  if (responsavelId != null && !(await pessoasValidas(x.r.quadro, [responsavelId], x.item.responsavelId != null ? [x.item.responsavelId] : [])))
    return erro("Só pessoas do quadro podem ser responsáveis.", 422);
  await atualizarItemChecklist(x.item, p.data);
  const mudou =
    p.data.feito === true ? "concluído" : p.data.feito === false ? "reaberto" : p.data.texto != null ? "renomeado" : p.data.prazo !== undefined ? "com prazo alterado" : responsavelId !== undefined ? "com responsável alterado" : null;
  if (mudou)
    await registrarAuditoria({
      usuario: x.u,
      acao: "editar",
      entidade: "tarefa",
      entidadeId: x.r.tarefa.id,
      resumo: `Tarefa ${rotuloTicket(x.r.tarefa.ticket)}: item "${p.data.texto ?? x.item.texto}" ${mudou}`,
    });
  // O responsável NOVO do item é avisado.
  if (responsavelId != null && responsavelId !== x.item.responsavelId)
    await avisarSobreTarefa(x.u, "atribuida", [responsavelId], x.r.tarefa, x.r.quadro, `Item do checklist atribuído a você: ${x.item.texto}`);
  return ok();
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const x = await itemDaTarefa(ctx);
  if ("resp" in x) return x.resp;
  await excluirItemChecklist(x.item.id);
  await registrarAuditoria({ usuario: x.u, acao: "editar", entidade: "tarefa", entidadeId: x.r.tarefa.id, resumo: `Tarefa ${rotuloTicket(x.r.tarefa.ticket)}: item "${x.item.texto}" removido do checklist` });
  return ok();
}
