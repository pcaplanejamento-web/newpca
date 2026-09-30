import { exigirSessao, intId, recusaNoQuadro } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { criarChecklist, tarefaAcessivel } from "@/lib/tarefas";
import { rotuloTicket } from "@/lib/tarefas-core";
import { checklistNomeSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/** Um CHECKLIST nomeado novo (vazio) no fim da tarefa — qualquer pessoa do grupo do quadro. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const r = id ? await tarefaAcessivel(a.u, id) : null;
  if (!id || !r) return erro("Tarefa não encontrada.", 404);
  const negado = recusaNoQuadro(a.acesso, r.quadro, "manipular", true);
  if (negado) return negado;
  const p = await parseCorpo(checklistNomeSchema, req);
  if ("resp" in p) return p.resp;
  const cid = await criarChecklist(id, p.data.nome);
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "tarefa", entidadeId: id, resumo: `Tarefa ${rotuloTicket(r.tarefa.ticket)}: checklist "${p.data.nome}" criado` });
  return ok({ id: cid });
}
