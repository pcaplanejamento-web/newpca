import { exigirSessao, recusaNoQuadro } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { notificar } from "@/lib/notificacoes";
import { aplicarMassaTarefas, aposMovimento, avisosSobreTarefa, equipesDoQuadro, etiquetasDoQuadro, getLista, jaComEquipe, jaResponsavelEm, membrosDasEquipes, pessoasValidas, quadroAcessivel, tarefasPorIds } from "@/lib/tarefas";
import { rotuloTicket } from "@/lib/tarefas-core";
import { type AcaoMassaTarefas, massaTarefasSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

const DESCREVE: Record<AcaoMassaTarefas["campo"], string> = {
  lista: "movida de lista",
  responsavel: "responsável alterado",
  etiqueta: "etiqueta alterada",
  equipe: "equipe alterada",
  prazo: "prazo alterado",
  prioridade: "prioridade alterada",
  arquivar: "arquivada/restaurada",
};

/**
 * EDIÇÃO EM MASSA das tarefas de UM quadro (aba Lista) — qualquer pessoa do grupo. As de outro quadro (ou sumidas) viram
 * `falhas`; o destino (lista/pessoa/etiqueta) é conferido UMA vez contra o quadro; tudo num lote atômico.
 */
export async function POST(req: Request) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(massaTarefasSchema, req);
  if ("resp" in p) return p.resp;
  const { ids, acao } = p.data;
  const achadas = await tarefasPorIds(ids);
  if (!achadas.length) return erro("Tarefas não encontradas.", 404);
  const quadro = await quadroAcessivel(a.u, achadas[0].quadroId);
  if (!quadro) return erro("Quadro não encontrado.", 404);
  const negado = recusaNoQuadro(a.acesso, quadro, "manipular", true);
  if (negado) return negado;
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
  if (acao.campo === "responsavel" && acao.modo === "adicionar" && !(await pessoasValidas(quadro, [acao.usuarioId])))
    return erro("Só pessoas do quadro podem ser responsáveis.", 422);
  if (acao.campo === "etiqueta" && !(await etiquetasDoQuadro(quadro.id, [acao.etiquetaId])).length) return erro("Etiqueta inválida.", 422);
  if (acao.campo === "equipe" && !(await equipesDoQuadro(quadro.id, [acao.equipeId])).length) return erro("Equipe inválida.", 422);
  // Quem JÁ era responsável / as tarefas que JÁ tinham a equipe: só os NOVOS são avisados.
  const idsQuadro = doQuadro.map((t) => t.id);
  const jaTinham =
    acao.campo === "responsavel" && acao.modo === "adicionar"
      ? await jaResponsavelEm(idsQuadro, acao.usuarioId)
      : acao.campo === "equipe" && acao.modo === "adicionar"
        ? await jaComEquipe(idsQuadro, acao.equipeId)
        : new Set<number>();
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
  // Os avisos de TODAS as tarefas numa gravação só (o limite de consultas por requisição).
  const novas = doQuadro.filter((t) => !jaTinham.has(t.id));
  if (acao.campo === "responsavel" && acao.modo === "adicionar")
    await notificar(
      novas.flatMap((t) => avisosSobreTarefa(a.u, "atribuida", [acao.usuarioId], t, quadro, "Tarefa atribuída a você")),
      a.u.id,
    );
  if (acao.campo === "equipe" && acao.modo === "adicionar" && novas.length) {
    const membros = await membrosDasEquipes([acao.equipeId]);
    await notificar(
      novas.flatMap((t) => avisosSobreTarefa(a.u, "atribuida", membros, t, quadro, "Tarefa atribuída à sua equipe")),
      a.u.id,
    );
  }
  return ok({ alterados: doQuadro.length, falhas, atualizar });
}
