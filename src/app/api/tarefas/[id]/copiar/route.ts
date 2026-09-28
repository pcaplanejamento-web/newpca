import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { aposMovimento, colocarTarefaApos, copiarTarefa, getLista, MSG_QUADRO_ARQUIVADO, quadroAcessivel, tarefaAcessivel } from "@/lib/tarefas";
import { rotuloTicket } from "@/lib/tarefas-core";
import { copiarTarefaSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/**
 * COPIA a tarefa para uma lista (deste ou de outro quadro que o usuário vê) — também "Criar template" e "Criar a partir do
 * template". A cópia de um cartão comum roda as automações do destino; o template, não.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const r = id ? await tarefaAcessivel(a.u, id) : null;
  if (!id || !r) return erro("Tarefa não encontrada.", 404);
  const p = await parseCorpo(copiarTarefaSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;
  const destino = d.quadroId === r.quadro.id ? r.quadro : await quadroAcessivel(a.u, d.quadroId);
  if (!destino) return erro("Quadro de destino não encontrado.", 404);
  if (destino.arquivado) return erro(MSG_QUADRO_ARQUIVADO, 409);
  const lista = await getLista(d.listaId);
  if (!lista || lista.quadroId !== destino.id || lista.arquivada) return erro("Lista inválida.", 422);
  const nova = await copiarTarefa(a.u, r, destino, lista, d);
  if (d.aposId) await colocarTarefaApos(nova.id, lista.id, d.aposId, lista.concluida);
  await registrarAuditoria({
    usuario: a.u,
    acao: "criar",
    entidade: "tarefa",
    entidadeId: nova.id,
    resumo: d.template
      ? `Template ${rotuloTicket(nova.ticket)} criado de ${rotuloTicket(r.tarefa.ticket)}${destino.id !== r.quadro.id ? ` (quadro "${r.quadro.nome}")` : ""}`
      : `Tarefa ${rotuloTicket(nova.ticket)} copiada de ${rotuloTicket(r.tarefa.ticket)}${destino.id !== r.quadro.id ? ` (quadro "${r.quadro.nome}")` : ""}${r.tarefa.template ? " — a partir do template" : ""}`,
  });
  const atualizar = d.template ? false : await aposMovimento(a.u, destino, [nova.id], lista);
  return ok({ ...nova, quadroId: destino.id, atualizar });
}
