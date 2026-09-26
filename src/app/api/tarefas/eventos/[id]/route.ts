import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { dataBR } from "@/lib/format";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atualizarEvento, avisarConvite, excluirEvento, getEvento, pessoasValidas, tarefaAcessivel } from "@/lib/tarefas";
import { participaDoEvento, rotuloTicket } from "@/lib/tarefas-core";
import { eventoSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** O evento e a tarefa dele, se o usuário vê a tarefa (membro do grupo do quadro); o PRIVADO só para quem participa. */
async function eventoAcessivel(ctx: Ctx) {
  const a = await exigirUsuario();
  if ("erro" in a) return { resp: a.erro };
  const id = intId((await ctx.params).id);
  const evento = id ? await getEvento(id) : null;
  const r = evento ? await tarefaAcessivel(a.u, evento.tarefaId) : null;
  if (!evento || !r) return { resp: erro("Evento não encontrado.", 404) };
  if (evento.privado && a.u.role !== "admin" && !participaDoEvento(evento, a.u.id, r.tarefa.pessoas)) return { resp: erro("Evento privado — só quem participa pode alterá-lo.", 403) };
  return { u: a.u, evento, r };
}

/** Edita o evento (título, datas, horário, repetição, local, link, convidados, livre/ocupado, privado, cor, lembrete). */
export async function PATCH(req: Request, ctx: Ctx) {
  const x = await eventoAcessivel(ctx);
  if ("resp" in x) return x.resp;
  const p = await parseCorpo(eventoSchema, req);
  if ("resp" in p) return p.resp;
  const atuais = x.evento.convidados.map((c) => c.usuarioId);
  if (!(await pessoasValidas(x.r.quadro.grupoId, p.data.convidados, atuais))) return erro("Só pessoas do grupo do quadro podem ser convidadas.", 422);
  await atualizarEvento(x.evento.id, p.data);
  await registrarAuditoria({
    usuario: x.u,
    acao: "editar",
    entidade: "tarefa",
    entidadeId: x.r.tarefa.id,
    resumo: `Tarefa ${rotuloTicket(x.r.tarefa.ticket)}: evento "${p.data.titulo}" alterado (${dataBR(p.data.data)}${p.data.horaInicio ? ` ${p.data.horaInicio}` : ""})`,
    antes: x.evento,
    depois: p.data,
  });
  await avisarConvite(
    x.u,
    p.data.convidados.filter((c) => !atuais.includes(c)),
    { id: x.evento.id, titulo: p.data.titulo, data: p.data.data },
    x.r.tarefa,
    x.r.quadro,
  );
  return ok();
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const x = await eventoAcessivel(ctx);
  if ("resp" in x) return x.resp;
  await excluirEvento(x.evento.id);
  await registrarAuditoria({
    usuario: x.u,
    acao: "editar",
    entidade: "tarefa",
    entidadeId: x.r.tarefa.id,
    resumo: `Tarefa ${rotuloTicket(x.r.tarefa.ticket)}: evento "${x.evento.titulo}" excluído`,
    antes: x.evento,
  });
  return ok();
}
