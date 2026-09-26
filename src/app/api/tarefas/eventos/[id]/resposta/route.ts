import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { avisarResposta, getEvento, responderConvite, tarefaAcessivel } from "@/lib/tarefas";
import { ROTULO_RESPOSTA, rotuloTicket } from "@/lib/tarefas-core";
import { respostaConviteSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/** A RESPOSTA ao convite (Vai · Não vai · Talvez) — só o próprio convidado; quem criou é avisado no sino. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const evento = id ? await getEvento(id) : null;
  const r = evento ? await tarefaAcessivel(a.u, evento.tarefaId) : null;
  if (!evento || !r) return erro("Evento não encontrado.", 404);
  if (!evento.convidados.some((c) => c.usuarioId === a.u.id)) return erro("Você não foi convidado para este evento.", 403);
  const p = await parseCorpo(respostaConviteSchema, req);
  if ("resp" in p) return p.resp;
  await responderConvite(evento.id, a.u.id, p.data.resposta);
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "tarefa",
    entidadeId: r.tarefa.id,
    resumo: `Tarefa ${rotuloTicket(r.tarefa.ticket)}: resposta ao evento "${evento.titulo}" — ${ROTULO_RESPOSTA[p.data.resposta]}`,
  });
  await avisarResposta(a.u, evento.criadoPor, p.data.resposta, evento, r.tarefa, r.quadro.id);
  return ok();
}
