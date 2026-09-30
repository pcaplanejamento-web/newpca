import { exigirSessao, intId, recusaNoQuadro } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { avisarSobreTarefa, editarComentario, excluirComentario, getComentario, lerMencoes, pessoasDoQuadro, tarefaAcessivel } from "@/lib/tarefas";
import { mencoesDoTexto, rotuloTicket } from "@/lib/tarefas-core";
import { comentarioSchema } from "@/lib/tarefas-validation";
import { nomeExibicao } from "@/lib/pessoa";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; cid: string }> };

/** O comentário DESTA tarefa: o PRÓPRIO se edita/exclui com Manipular; o de OUTRA pessoa só se exclui, com Excluir. */
async function comentario(ctx: Ctx, excluir: boolean) {
  const a = await exigirSessao();
  if ("erro" in a) return { resp: a.erro };
  const ps = await ctx.params;
  const id = intId(ps.id);
  const cid = intId(ps.cid);
  const r = id ? await tarefaAcessivel(a.u, id) : null;
  const c = r && cid ? await getComentario(cid) : null;
  if (!r || !c || c.tarefaId !== r.tarefa.id) return { resp: erro("Comentário não encontrado.", 404) };
  const proprio = c.usuarioId === a.u.id;
  if (!proprio && !excluir) return { resp: erro("Só o autor pode alterar o comentário.", 403) };
  const negado = recusaNoQuadro(a.acesso, r.quadro, proprio ? "manipular" : "excluir", true);
  if (negado) return { resp: negado };
  return { u: a.u, r, c };
}

export async function PATCH(req: Request, ctx: Ctx) {
  const x = await comentario(ctx, false);
  if ("resp" in x) return x.resp;
  const p = await parseCorpo(comentarioSchema, req);
  if ("resp" in p) return p.resp;
  const mencoes = mencoesDoTexto(p.data.texto, await pessoasDoQuadro(x.r.quadro));
  await editarComentario(x.c.id, p.data.texto, mencoes);
  await registrarAuditoria({ usuario: x.u, acao: "editar", entidade: "tarefa", entidadeId: x.r.tarefa.id, resumo: `Tarefa ${rotuloTicket(x.r.tarefa.ticket)}: comentário editado` });
  // Só quem foi citado AGORA (não estava no texto anterior) é avisado.
  const antes = new Set(lerMencoes(x.c.mencoes));
  await avisarSobreTarefa(x.u, "mencionada", mencoes.filter((m) => !antes.has(m)), x.r.tarefa, x.r.quadro, `${nomeExibicao(x.u)} mencionou você`);
  return ok({ mencoes });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const x = await comentario(ctx, true);
  if ("resp" in x) return x.resp;
  await excluirComentario(x.c.id);
  await registrarAuditoria({ usuario: x.u, acao: "excluir", entidade: "tarefa", entidadeId: x.r.tarefa.id, resumo: `Tarefa ${rotuloTicket(x.r.tarefa.ticket)}: comentário excluído` });
  return ok();
}
