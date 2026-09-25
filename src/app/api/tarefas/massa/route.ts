import { exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { aplicarMassaTarefas, aposMovimento, avisarSobreTarefa, etiquetasDoQuadro, getLista, pessoasValidas, quadroAcessivel, tarefasPorIds } from "@/lib/tarefas";
import { rotuloTicket } from "@/lib/tarefas-core";
import { type AcaoMassaTarefas, massaTarefasSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

const DESCREVE: Record<AcaoMassaTarefas["campo"], string> = {
  lista: "movida de lista",
  responsavel: "responsável alterado",
  etiqueta: "etiqueta alterada",
  prazo: "prazo alterado",
  prioridade: "prioridade alterada",
  arquivar: "arquivada/restaurada",
};

/**
 * EDIÇÃO EM MASSA das tarefas de UM quadro (aba Lista) — qualquer pessoa do grupo. As de outro quadro (ou sumidas) viram
 * `falhas`; o destino (lista/pessoa/etiqueta) é conferido UMA vez contra o quadro; tudo num lote atômico.
 */
export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(massaTarefasSchema, req);
  if ("resp" in p) return p.resp;
  const { ids, acao } = p.data;
  const achadas = await tarefasPorIds(ids);
  if (!achadas.length) return erro("Tarefas não encontradas.", 404);
  const quadro = await quadroAcessivel(a.u, achadas[0].quadroId);
  if (!quadro) return erro("Quadro não encontrado.", 404);
  const falhas: { id: number; ticket: number | null; motivo: string }[] = [];
  for (const id of ids) if (!achadas.some((t) => t.id === id)) falhas.push({ id, ticket: null, motivo: "Tarefa não encontrada." });
  const doQuadro = achadas.filter((t) => {
    if (t.quadroId === quadro.id) return true;
    falhas.push({ id: t.id, ticket: t.ticket, motivo: "De outro quadro." });
    return false;
  });
  let destino: { id: number; concluida: boolean } | null = null;
  if (acao.campo === "lista") {
    const l = await getLista(acao.listaId);
    if (!l || l.quadroId !== quadro.id || l.arquivada) return erro("Lista inválida.", 422);
    destino = l;
  }
  if (acao.campo === "responsavel" && acao.modo === "adicionar" && !(await pessoasValidas(quadro.grupoId, [acao.usuarioId])))
    return erro("Só pessoas do grupo do quadro podem ser responsáveis.", 422);
  if (acao.campo === "etiqueta" && !(await etiquetasDoQuadro(quadro.id, [acao.etiquetaId])).length) return erro("Etiqueta inválida.", 422);
  if (doQuadro.length) {
    await aplicarMassaTarefas(
      doQuadro.map((t) => t.id),
      acao,
      destino?.concluida ?? false,
    );
    for (const t of doQuadro)
      await registrarAuditoria({
        usuario: a.u,
        acao: "editar",
        entidade: "tarefa",
        entidadeId: t.id,
        origem: "massa",
        resumo: `Tarefa ${rotuloTicket(t.ticket)} "${t.titulo}": ${DESCREVE[acao.campo]} (em massa)`,
        depois: acao,
      });
  }
  let atualizar = false;
  if (destino) {
    const entraram = doQuadro.filter((t) => t.listaId !== destino.id).map((t) => t.id);
    atualizar = await aposMovimento(a.u, quadro, entraram, destino);
  }
  if (acao.campo === "responsavel" && acao.modo === "adicionar")
    for (const t of doQuadro) await avisarSobreTarefa(a.u, "atribuida", [acao.usuarioId], t, quadro, "Tarefa atribuída a você");
  return ok({ alterados: doQuadro.length, falhas, atualizar });
}
