import { exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { aposMovimento, avisarAtribuicao, avisarConvite, conteudoTarefa, criarTarefa, equipesDoQuadro, etiquetasDoQuadro, getLista, listarCampos, membrosDasEquipes, MSG_QUADRO_ARQUIVADO, pessoasValidas, quadroAcessivel, tituloAutomatico, valoresValidos, vinculoAcessivel } from "@/lib/tarefas";
import { eventoParaAuditoria, lerBlocos, rotuloTicket } from "@/lib/tarefas-core";
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
  if (q.arquivado) return erro(MSG_QUADRO_ARQUIVADO, 409);
  const lista = await getLista(d.listaId);
  if (!lista || lista.quadroId !== q.id || lista.arquivada) return erro("Lista inválida.", 422);
  const pessoas = d.pessoas ?? [];
  const observadores = d.observadores ?? [];
  if (!(await pessoasValidas(q, [...pessoas, ...observadores]))) return erro("Só pessoas do quadro podem ser responsáveis ou observadoras.", 422);
  for (const v of d.vinculos ?? []) if (!(await vinculoAcessivel(a.u, v))) return erro("Vínculo não encontrado.", 422);
  const equipes = await equipesDoQuadro(q.id, d.equipes ?? []);
  const eventos = d.eventos ?? [];
  const convidados = [...new Set(eventos.flatMap((e) => e.convidados ?? []))];
  if (convidados.length && !(await pessoasValidas(q, convidados))) return erro("Só pessoas do quadro podem ser convidadas.", 422);
  const campos = await listarCampos([q.id]);
  const valores = valoresValidos(campos, d.campos ?? []);
  if (!valores) return erro("Campo de outro quadro.", 422);
  const valoresFinais = valores.filter((v): v is { campoId: number; valor: string } => v.valor != null);
  const titulo = tituloAutomatico(q, campos, Object.fromEntries(valoresFinais.map((v) => [v.campoId, v.valor])), !!d.tituloManual) ?? d.titulo;
  const nova = await criarTarefa({
    quadroId: q.id,
    listaId: lista.id,
    titulo,
    descricao: d.descricao ?? null,
    prioridade: d.prioridade ?? "media",
    inicio: d.inicio ?? null,
    prazo: d.prazo ?? null,
    prazoHora: d.prazoHora ?? null,
    lembreteMin: d.lembreteMin ?? null,
    concluida: lista.concluida,
    pessoas,
    observadores,
    etiquetas: await etiquetasDoQuadro(q.id, d.etiquetas ?? []),
    equipes,
    criadoPor: a.u.id,
    estimativaH: d.estimativaH ?? null,
    vinculos: d.vinculos ?? [],
    recorrencia: d.recorrencia ?? null,
    checklists: d.checklists ?? [],
    blocos: d.blocos ? lerBlocos(d.blocos) : null,
    eventos,
    campos: valoresFinais,
    tituloManual: !!d.tituloManual,
  });
  await registrarAuditoria({
    usuario: a.u,
    acao: "criar",
    entidade: "tarefa",
    entidadeId: nova.id,
    resumo: `Tarefa ${rotuloTicket(nova.ticket)} "${titulo}" criada no quadro "${q.nome}"`,
    // Os eventos PRIVADOS não vão ao histórico com o conteúdo.
    depois: { ...d, eventos: eventos.map((e) => eventoParaAuditoria(e).dados) },
  });
  // Os responsáveis e os membros das EQUIPES recebem "tarefa atribuída".
  await avisarAtribuicao(a.u, [], [...pessoas, ...(await membrosDasEquipes(equipes))], { ...nova, titulo }, q);
  // Os CONVIDADOS dos eventos criados junto com a tarefa recebem o convite.
  if (convidados.length)
    for (const e of (await conteudoTarefa(nova.id)).eventos)
      await avisarConvite(a.u, e.convidados.map((c) => c.usuarioId), { id: e.id, titulo: e.titulo, data: e.data }, { ...nova, titulo }, q);
  // Criar numa lista também é "entrar" nela (automações; criada já concluída e recorrente gera a próxima).
  const atualizar = await aposMovimento(a.u, q, [nova.id], lista);
  return ok({ ...nova, atualizar });
}
