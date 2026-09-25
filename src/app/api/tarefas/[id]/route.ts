import { exigirEditor, exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atualizarTarefa, etiquetasDoQuadro, excluirTarefa, getLista, moverTarefa, pessoasValidas, tarefaAcessivel, ultimoDaLista } from "@/lib/tarefas";
import { rotuloTicket } from "@/lib/tarefas-core";
import { editarTarefaSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** A tarefa COMPLETA (com a descrição) — o detalhe do cartão. */
export async function GET(_req: Request, ctx: Ctx) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const r = id ? await tarefaAcessivel(a.u, id) : null;
  if (!r) return erro("Tarefa não encontrada.", 404);
  return ok({ tarefa: r.tarefa });
}

/** Edita a tarefa (campos, responsáveis, etiquetas, arquivar; trocar de LISTA a leva ao fim da lista nova). */
export async function PATCH(req: Request, ctx: Ctx) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const r = id ? await tarefaAcessivel(a.u, id) : null;
  if (!id || !r) return erro("Tarefa não encontrada.", 404);
  const p = await parseCorpo(editarTarefaSchema, req);
  if ("resp" in p) return p.resp;
  const { listaId, pessoas, etiquetas, ...campos } = p.data;
  if (pessoas && !(await pessoasValidas(r.quadro.grupoId, pessoas, r.tarefa.pessoas)))
    return erro("Só pessoas do grupo do quadro podem ser responsáveis.", 422);
  if (listaId != null && listaId !== r.tarefa.listaId) {
    const lista = await getLista(listaId);
    if (!lista || lista.quadroId !== r.quadro.id || lista.arquivada) return erro("Lista inválida.", 422);
    await moverTarefa(id, lista.id, await ultimoDaLista(lista.id, id), null, lista.concluida);
  }
  await atualizarTarefa(id, campos, { pessoas, etiquetas: etiquetas ? await etiquetasDoQuadro(r.quadro.id, etiquetas) : undefined });
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "tarefa",
    entidadeId: id,
    resumo: `Tarefa ${rotuloTicket(r.tarefa.ticket)} "${r.tarefa.titulo}" ${campos.arquivada === true ? "arquivada" : campos.arquivada === false ? "restaurada" : "editada"}`,
    antes: r.tarefa,
    depois: p.data,
  });
  return ok();
}

/** Exclui a tarefa (editores) — no dia a dia, prefira arquivar. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const r = id ? await tarefaAcessivel(a.u, id) : null;
  if (!id || !r) return erro("Tarefa não encontrada.", 404);
  await excluirTarefa(id);
  await registrarAuditoria({ usuario: a.u, acao: "excluir", entidade: "tarefa", entidadeId: id, resumo: `Tarefa ${rotuloTicket(r.tarefa.ticket)} "${r.tarefa.titulo}" excluída`, antes: r.tarefa });
  return ok();
}
