import { exigirEditor, exigirUsuario, intId } from "@/lib/api-auth";
import { urlDoCartao } from "@/lib/trello-fila";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import {
  aposMovimento,
  atualizarTarefa,
  avisarAtribuicao,
  conteudoTarefa,
  equipesDoQuadro,
  etiquetasDoQuadro,
  excluirTarefa,
  getLista,
  listarCampos,
  membrosDasEquipes,
  moverTarefa,
  pessoasValidas,
  tarefaAcessivel,
  tituloAutomatico,
  ultimoDaLista,
  valoresValidos,
  vinculoAcessivel,
} from "@/lib/tarefas";
import { chaveVinculo, lerBlocos, mascararPrivados, rotuloTicket, type ValorCampoNovo, valoresAposMudar } from "@/lib/tarefas-core";
import { contextoTarefa } from "@/lib/tarefas-dados";
import { editarTarefaSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * A tarefa COMPLETA (com a descrição) + o CONTEÚDO (checklist, comentários e eventos) — o detalhe do cartão. `?contexto=1`
 * = o CONTEXTO do quadro dela (listas, etiquetas, pessoas, modelos) para abrir a tarefa fora do quadro (o Calendário);
 * `?contexto=tarefa` = só o resumo atualizado da tarefa (o Calendário depois de salvar — sem reler o quadro).
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
  if (new URL(req.url).searchParams.get("contexto") === "tarefa") return ok({ tarefa: r.tarefa });
  const conteudo = await conteudoTarefa(r.tarefa.id);
  return ok({ tarefa: r.tarefa, ...conteudo, trelloUrl: await urlDoCartao(r.tarefa.id), eventos: mascararPrivados(conteudo.eventos, a.u.id, new Map([[r.tarefa.id, r.tarefa.envolvidos]])) });
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
  const { listaId, pessoas, observadores, etiquetas, equipes: equipesPedidas, blocos: blocosPedidos, campos: valoresPedidos, ...campos } = p.data;
  const blocos = blocosPedidos === undefined ? undefined : (lerBlocos(blocosPedidos) ?? []);
  const atuais = [...r.tarefa.pessoas, ...r.tarefa.observadores];
  if (!(await pessoasValidas(r.quadro, [...(pessoas ?? []), ...(observadores ?? [])], atuais)))
    return erro("Só pessoas do quadro podem ser responsáveis ou observadoras.", 422);
  // Só os vínculos NOVOS são conferidos (um alvo que ficou inacessível depois segue na tarefa); nunca a própria tarefa.
  if (campos.vinculos) {
    const antes = new Set(r.tarefa.vinculos.map(chaveVinculo));
    if (campos.vinculos.some((v) => v.tipo === "tarefa" && v.id === id)) return erro("A tarefa não se vincula a ela mesma.", 422);
    for (const v of campos.vinculos) if (!antes.has(chaveVinculo(v)) && !(await vinculoAcessivel(a.u, v))) return erro("Vínculo não encontrado.", 422);
  }
  if (campos.concluida === true && r.tarefa.template) return erro("Um template não se conclui — crie uma tarefa a partir dele.", 422);
  const equipes = equipesPedidas ? await equipesDoQuadro(r.quadro.id, equipesPedidas) : undefined;
  // CAMPOS personalizados + o TÍTULO AUTOMÁTICO (quando os valores mudam ou a pessoa volta ao automático).
  let valores: ValorCampoNovo[] = [];
  if (valoresPedidos || campos.tituloManual === false) {
    const defs = await listarCampos([r.quadro.id]);
    const v = valoresValidos(defs, valoresPedidos ?? []);
    if (!v) return erro("Campo de outro quadro.", 422);
    valores = v;
    const manual = campos.tituloManual ?? !!r.tarefa.tituloManual;
    const auto = campos.titulo == null ? tituloAutomatico(r.quadro, defs, valoresAposMudar(r.tarefa.campos ?? {}, v), manual) : null;
    if (auto) campos.titulo = auto;
  }
  // Concluir/reabrir NO LUGAR: só conta a mudança de fato (concluir uma concluída não dispara nada de novo).
  const concluiu = campos.concluida === true && r.tarefa.concluidaEm == null;
  const reabriu = campos.concluida === false && r.tarefa.concluidaEm != null;
  let entrou: { id: number; concluida: boolean } | null = null;
  if (listaId != null && listaId !== r.tarefa.listaId) {
    const lista = await getLista(listaId);
    if (!lista || lista.quadroId !== r.quadro.id || lista.arquivada) return erro("Lista inválida.", 422);
    await moverTarefa(id, lista.id, await ultimoDaLista(lista.id, id), null, lista.concluida);
    entrou = lista;
  }
  await atualizarTarefa(
    id,
    { ...campos, blocos },
    { pessoas, observadores, etiquetas: etiquetas ? await etiquetasDoQuadro(r.quadro.id, etiquetas) : undefined, equipes },
    valores,
  );
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "tarefa",
    entidadeId: id,
    resumo: `Tarefa ${rotuloTicket(r.tarefa.ticket)} "${r.tarefa.titulo}" ${
      campos.arquivada === true ? "arquivada" : campos.arquivada === false ? "restaurada" : concluiu ? "concluída" : reabriu ? "reaberta" : "editada"
    }`,
    antes: r.tarefa,
    depois: p.data,
  });
  // Quem PASSOU a ser da tarefa (responsável novo ou membro de uma equipe nova) recebe "tarefa atribuída".
  if (pessoas || equipes) {
    const depois = [...(pessoas ?? r.tarefa.pessoas), ...(await membrosDasEquipes(equipes ?? r.tarefa.equipes))];
    await avisarAtribuicao(a.u, r.tarefa.envolvidos, depois, { ...r.tarefa, titulo: campos.titulo ?? r.tarefa.titulo }, r.quadro);
  }
  // Entrou noutra lista: automações e, concluída, a próxima ocorrência (depois de gravar a regra nova, se veio junto).
  // Concluída no lugar: as regras "ao concluir" e a recorrência.
  const atualizar = entrou ? await aposMovimento(a.u, r.quadro, [id], entrou) : concluiu ? await aposMovimento(a.u, r.quadro, [id], { id: null, concluida: true }) : false;
  return ok({ atualizar, titulo: campos.titulo ?? r.tarefa.titulo });
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
