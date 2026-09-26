import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { dataBR } from "@/lib/format";
import { erro, ok, parseCorpo } from "@/lib/http";
import { avisarConvite, contarEventos, criarEvento, pessoasValidas, tarefaAcessivel } from "@/lib/tarefas";
import { rotuloTicket } from "@/lib/tarefas-core";
import { eventoSchema, MAX_EVENTOS_TAREFA } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/** Cadastra um EVENTO na tarefa (bloco "Eventos" e o "Criar" do calendário) — qualquer pessoa do grupo do quadro; os
 * CONVIDADOS (pessoas do grupo) recebem o convite no sino. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const r = id ? await tarefaAcessivel(a.u, id) : null;
  if (!id || !r) return erro("Tarefa não encontrada.", 404);
  const p = await parseCorpo(eventoSchema, req);
  if ("resp" in p) return p.resp;
  if ((await contarEventos(id)) >= MAX_EVENTOS_TAREFA) return erro(`Até ${MAX_EVENTOS_TAREFA} eventos por tarefa.`, 409);
  if (!(await pessoasValidas(r.quadro.grupoId, p.data.convidados))) return erro("Só pessoas do grupo do quadro podem ser convidadas.", 422);
  const eventoId = await criarEvento(id, p.data, a.u.id);
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "tarefa",
    entidadeId: id,
    resumo: `Tarefa ${rotuloTicket(r.tarefa.ticket)}: evento "${p.data.titulo}" em ${dataBR(p.data.data)}${p.data.horaInicio ? ` às ${p.data.horaInicio}` : ""}`,
    depois: p.data,
  });
  await avisarConvite(a.u, p.data.convidados, { id: eventoId, titulo: p.data.titulo, data: p.data.data }, r.tarefa, r.quadro);
  return ok({ id: eventoId });
}
