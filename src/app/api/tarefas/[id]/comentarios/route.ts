import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { nomeExibicao } from "@/lib/pessoa";
import { avisarSobreTarefa, criarComentario, tarefaAcessivel } from "@/lib/tarefas";
import { mencoesDoTexto, rotuloTicket } from "@/lib/tarefas-core";
import { comentarioSchema } from "@/lib/tarefas-validation";
import { listarPessoasDoGrupo } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

/** COMENTA a tarefa — as @menções são resolvidas no servidor entre as pessoas do grupo do quadro. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const r = id ? await tarefaAcessivel(a.u, id) : null;
  if (!id || !r) return erro("Tarefa não encontrada.", 404);
  const p = await parseCorpo(comentarioSchema, req);
  if ("resp" in p) return p.resp;
  const mencoes = mencoesDoTexto(p.data.texto, await listarPessoasDoGrupo(r.quadro.grupoId));
  const cid = await criarComentario({ tarefaId: id, usuarioId: a.u.id, usuarioNome: nomeExibicao(a.u), texto: p.data.texto, mencoes });
  await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "tarefa", entidadeId: id, resumo: `Tarefa ${rotuloTicket(r.tarefa.ticket)}: comentário` });
  // Os citados recebem "mencionou você"; os demais responsáveis/observadores, "novo comentário".
  await avisarSobreTarefa(a.u, "mencionada", mencoes, r.tarefa, r.quadro, `${nomeExibicao(a.u)} mencionou você`);
  const acompanham = [...r.tarefa.pessoas, ...r.tarefa.observadores].filter((p) => !mencoes.includes(p));
  await avisarSobreTarefa(a.u, "comentario", acompanham, r.tarefa, r.quadro, `${nomeExibicao(a.u)} comentou numa tarefa`);
  return ok({ id: cid, mencoes });
}
