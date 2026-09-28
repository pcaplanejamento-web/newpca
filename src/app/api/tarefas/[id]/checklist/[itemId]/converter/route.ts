import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok } from "@/lib/http";
import { aposMovimento, avisarAtribuicao, criarTarefa, excluirItemChecklist, getItemChecklist, getLista, MSG_QUADRO_ARQUIVADO, pessoasValidas, tarefaAcessivel } from "@/lib/tarefas";
import { rotuloTicket } from "@/lib/tarefas-core";

export const dynamic = "force-dynamic";

/**
 * CONVERTE um item do checklist numa TAREFA na MESMA lista: o texto vira o título, o prazo e o responsável do item vão
 * junto (o responsável só se ainda for do grupo) e o item sai do checklist. Qualquer pessoa do grupo do quadro.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const ps = await ctx.params;
  const id = intId(ps.id);
  const itemId = intId(ps.itemId);
  const r = id ? await tarefaAcessivel(a.u, id) : null;
  const item = r && itemId ? await getItemChecklist(itemId) : null;
  if (!r || !item || item.tarefaId !== r.tarefa.id) return erro("Item não encontrado.", 404);
  if (r.quadro.arquivado) return erro(MSG_QUADRO_ARQUIVADO, 409);
  const lista = await getLista(r.tarefa.listaId);
  if (!lista) return erro("Lista inválida.", 422);
  const pessoas = item.responsavelId != null && (await pessoasValidas(r.quadro, [item.responsavelId])) ? [item.responsavelId] : [];
  const nova = await criarTarefa({
    quadroId: r.quadro.id,
    listaId: lista.id,
    titulo: item.texto,
    descricao: null,
    prioridade: "media",
    inicio: null,
    prazo: item.prazo,
    concluida: item.feito || lista.concluida,
    pessoas,
    etiquetas: [],
    criadoPor: a.u.id,
  });
  await excluirItemChecklist(item.id);
  await registrarAuditoria({
    usuario: a.u,
    acao: "criar",
    entidade: "tarefa",
    entidadeId: nova.id,
    resumo: `Tarefa ${rotuloTicket(nova.ticket)} "${item.texto}" criada a partir do checklist da ${rotuloTicket(r.tarefa.ticket)}`,
  });
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "tarefa", entidadeId: r.tarefa.id, resumo: `Tarefa ${rotuloTicket(r.tarefa.ticket)}: item "${item.texto}" convertido na ${rotuloTicket(nova.ticket)}` });
  await avisarAtribuicao(a.u, [], pessoas, { ...nova, titulo: item.texto }, r.quadro);
  const atualizar = await aposMovimento(a.u, r.quadro, [nova.id], lista);
  return ok({ ...nova, atualizar });
}
