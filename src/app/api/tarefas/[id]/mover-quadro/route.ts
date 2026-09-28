import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { aposMovimento, getLista, MSG_QUADRO_ARQUIVADO, moverTarefaDeQuadro, quadroAcessivel, tarefaAcessivel } from "@/lib/tarefas";
import { rotuloTicket } from "@/lib/tarefas-core";
import { moverQuadroSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/**
 * MOVE a tarefa para OUTRO quadro que o usuário vê: ganha o ticket do destino e leva checklists, comentários, eventos e o
 * histórico; etiquetas pelo nome, só as pessoas do grupo do destino, equipes de mesmo nome. As automações do destino rodam.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const r = id ? await tarefaAcessivel(a.u, id) : null;
  if (!id || !r) return erro("Tarefa não encontrada.", 404);
  const p = await parseCorpo(moverQuadroSchema, req);
  if ("resp" in p) return p.resp;
  if (p.data.quadroId === r.quadro.id) return erro("A tarefa já está neste quadro — troque a lista.", 422);
  const destino = await quadroAcessivel(a.u, p.data.quadroId);
  if (!destino) return erro("Quadro de destino não encontrado.", 404);
  if (destino.arquivado) return erro(MSG_QUADRO_ARQUIVADO, 409);
  const lista = await getLista(p.data.listaId);
  if (!lista || lista.quadroId !== destino.id || lista.arquivada) return erro("Lista inválida.", 422);
  const x = await moverTarefaDeQuadro(r, destino, lista);
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "tarefa",
    entidadeId: id,
    resumo: `Tarefa ${rotuloTicket(r.tarefa.ticket)} movida do quadro "${r.quadro.nome}" para "${destino.nome}" (${rotuloTicket(x.ticket)}, lista "${lista.nome}")`,
  });
  await aposMovimento(a.u, destino, [id], lista);
  return ok({ ...x, quadroId: destino.id });
}
