import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { aposMovimento, getLista, moverTarefa, tarefaAcessivel } from "@/lib/tarefas";
import { rotuloTicket } from "@/lib/tarefas-core";
import { moverTarefaSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/** MOVE o cartão (arrastar): a lista de destino e os vizinhos onde caiu — devolve a ordem gravada (e a renumeração). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const r = id ? await tarefaAcessivel(a.u, id) : null;
  if (!id || !r) return erro("Tarefa não encontrada.", 404);
  const p = await parseCorpo(moverTarefaSchema, req);
  if ("resp" in p) return p.resp;
  const lista = await getLista(p.data.listaId);
  if (!lista || lista.quadroId !== r.quadro.id || lista.arquivada) return erro("Lista inválida.", 422);
  const res = await moverTarefa(id, lista.id, p.data.anteriorId, p.data.proximoId, lista.concluida);
  let atualizar = false;
  if (lista.id !== r.tarefa.listaId) {
    await registrarAuditoria({
      usuario: a.u,
      acao: "editar",
      entidade: "tarefa",
      entidadeId: id,
      resumo: `Tarefa ${rotuloTicket(r.tarefa.ticket)} movida para "${lista.nome}"`,
    });
    atualizar = await aposMovimento(a.u, r.quadro, [id], lista);
  }
  return ok({ ...res, atualizar });
}
