import { exigirEditor, exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import {
  aposMovimento,
  atualizarTarefa,
  avisarAtribuicao,
  conteudoTarefa,
  etiquetasDoQuadro,
  excluirTarefa,
  getLista,
  moverTarefa,
  pessoasValidas,
  tarefaAcessivel,
  ultimoDaLista,
  vinculoAcessivel,
} from "@/lib/tarefas";
import { lerBlocos, rotuloTicket } from "@/lib/tarefas-core";
import { contextoTarefa } from "@/lib/tarefas-dados";
import { editarTarefaSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * A tarefa COMPLETA (com a descrição) + o CONTEÚDO (checklist, comentários e eventos) — o detalhe do cartão. `?contexto=1`
 * = o CONTEXTO do quadro dela (listas, etiquetas, pessoas, modelos) para abrir a tarefa fora do quadro (o Calendário).
 */
export async function GET(req: Request, ctx: Ctx) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (id && new URL(req.url).searchParams.get("contexto") === "1") {
    const c = await contextoTarefa(a.u, id);
    return c ? ok({ contexto: c }) : erro("Tarefa não encontrada.", 404);
  }
  const r = id ? await tarefaAcessivel(a.u, id) : null;
  if (!r) return erro("Tarefa não encontrada.", 404);
  return ok({ tarefa: r.tarefa, ...(await conteudoTarefa(r.tarefa.id)) });
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
  const { listaId, pessoas, observadores, etiquetas, blocos: blocosPedidos, ...campos } = p.data;
  const blocos = blocosPedidos === undefined ? undefined : (lerBlocos(blocosPedidos) ?? []);
  const atuais = [...r.tarefa.pessoas, ...r.tarefa.observadores];
  if (!(await pessoasValidas(r.quadro.grupoId, [...(pessoas ?? []), ...(observadores ?? [])], atuais)))
    return erro("Só pessoas do grupo do quadro podem ser responsáveis ou observadoras.", 422);
  if (campos.vinculo && !(campos.vinculo.tipo === r.tarefa.vinculo?.tipo && campos.vinculo.id === r.tarefa.vinculo.id) && !(await vinculoAcessivel(a.u, campos.vinculo)))
    return erro("Vínculo não encontrado.", 422);
  let entrou: { id: number; concluida: boolean } | null = null;
  if (listaId != null && listaId !== r.tarefa.listaId) {
    const lista = await getLista(listaId);
    if (!lista || lista.quadroId !== r.quadro.id || lista.arquivada) return erro("Lista inválida.", 422);
    await moverTarefa(id, lista.id, await ultimoDaLista(lista.id, id), null, lista.concluida);
    entrou = lista;
  }
  await atualizarTarefa(id, { ...campos, blocos }, { pessoas, observadores, etiquetas: etiquetas ? await etiquetasDoQuadro(r.quadro.id, etiquetas) : undefined });
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "tarefa",
    entidadeId: id,
    resumo: `Tarefa ${rotuloTicket(r.tarefa.ticket)} "${r.tarefa.titulo}" ${campos.arquivada === true ? "arquivada" : campos.arquivada === false ? "restaurada" : "editada"}`,
    antes: r.tarefa,
    depois: p.data,
  });
  if (pessoas) await avisarAtribuicao(a.u, r.tarefa.pessoas, pessoas, { ...r.tarefa, titulo: campos.titulo ?? r.tarefa.titulo }, r.quadro);
  // Entrou noutra lista: automações e, concluída, a próxima ocorrência (depois de gravar a regra nova, se veio junto).
  const atualizar = entrou ? await aposMovimento(a.u, r.quadro, [id], entrou) : false;
  return ok({ atualizar });
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
