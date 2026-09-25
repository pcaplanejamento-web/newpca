import { exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { aposMovimento, avisarAtribuicao, criarTarefa, etiquetasDoQuadro, getLista, pessoasValidas, quadroAcessivel, vinculoAcessivel } from "@/lib/tarefas";
import { lerBlocos, rotuloTicket } from "@/lib/tarefas-core";
import { criarTarefaSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/** Cria uma TAREFA (cartão) na lista — qualquer pessoa do grupo do quadro. Responsáveis = pessoas do grupo. */
export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(criarTarefaSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;
  const q = await quadroAcessivel(a.u, d.quadroId);
  if (!q) return erro("Quadro não encontrado.", 404);
  const lista = await getLista(d.listaId);
  if (!lista || lista.quadroId !== q.id || lista.arquivada) return erro("Lista inválida.", 422);
  const pessoas = d.pessoas ?? [];
  const observadores = d.observadores ?? [];
  if (!(await pessoasValidas(q.grupoId, [...pessoas, ...observadores]))) return erro("Só pessoas do grupo do quadro podem ser responsáveis ou observadoras.", 422);
  if (d.vinculo && !(await vinculoAcessivel(a.u, d.vinculo))) return erro("Vínculo não encontrado.", 422);
  const nova = await criarTarefa({
    quadroId: q.id,
    listaId: lista.id,
    titulo: d.titulo,
    descricao: d.descricao ?? null,
    prioridade: d.prioridade ?? "media",
    inicio: d.inicio ?? null,
    prazo: d.prazo ?? null,
    concluida: lista.concluida,
    pessoas,
    observadores,
    etiquetas: await etiquetasDoQuadro(q.id, d.etiquetas ?? []),
    criadoPor: a.u.id,
    estimativaH: d.estimativaH ?? null,
    vinculo: d.vinculo ?? null,
    recorrencia: d.recorrencia ?? null,
    checklist: d.checklist ?? [],
    blocos: d.blocos ? lerBlocos(d.blocos) : null,
  });
  await registrarAuditoria({
    usuario: a.u,
    acao: "criar",
    entidade: "tarefa",
    entidadeId: nova.id,
    resumo: `Tarefa ${rotuloTicket(nova.ticket)} "${d.titulo}" criada no quadro "${q.nome}"`,
    depois: d,
  });
  await avisarAtribuicao(a.u, [], pessoas, { ...nova, titulo: d.titulo }, q);
  // Criar numa lista também é "entrar" nela (automações; criada já concluída e recorrente gera a próxima).
  const atualizar = await aposMovimento(a.u, q, [nova.id], lista);
  return ok({ ...nova, atualizar });
}
