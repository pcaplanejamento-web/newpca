import type { UsuarioSessao } from "./auth";
import { carregarEdicoes } from "./edicoes-tabela";
import { dataIsoBrasilia } from "./format";
import { getGrupoAtivoId, gruposDoUsuario } from "./grupos";
import {
  contadoresDosQuadros,
  dadosQuadro,
  etiquetasDoQuadroTodas,
  etiquetasDosQuadros,
  eventosDosQuadros,
  listasDoQuadro,
  listarAutomacoes,
  listarModelosQuadro,
  listarModelosTarefa,
  listarQuadros,
  quadroAcessivel,
  tarefaAcessivel,
  tarefasAbertasLeves,
  tarefasDoCalendario,
} from "./tarefas";
import { listarPreferenciasTabela } from "./preferencias-tabela";
import { CHAVE_OCULTOS_CALENDARIO, gradeMes, lerMes, lerOcultos, prefixoEdicoesTarefas, semanaDe } from "./tarefas-core";
import { listarPessoasDoGrupo, pessoasPorIds } from "./usuarios";

/**
 * A LISTA de quadros (`/painel/tarefas`): os do GRUPO ATIVO do cabeçalho; o ADM sem grupo ativo vê todos. `grupoAtivo`
 * = onde um quadro NOVO nasce (sem grupo, não se cria). `modelos` = os modelos de quadro dos grupos da pessoa (o ADM,
 * todos) — o "Novo quadro" pode partir de um deles.
 */
export async function carregarQuadros(u: UsuarioSessao) {
  const grupoAtivo = await getGrupoAtivoId(u);
  const hoje = dataIsoBrasilia(new Date().toISOString());
  const [quadros, modelos] = await Promise.all([
    listarQuadros(grupoAtivo == null ? (u.role === "admin" ? null : []) : [grupoAtivo], hoje),
    u.role === "admin" ? listarModelosQuadro(null) : gruposDoUsuario(u.id).then((g) => listarModelosQuadro(g.map((x) => x.id))),
  ]);
  return { quadros, grupoAtivo, modelos: modelos.map((m) => ({ id: m.id, nome: m.nome, listas: m.conteudo.listas.map((l) => l.nome) })) };
}

/**
 * O CALENDÁRIO (módulo `/painel/calendario?mes=AAAA-MM`): dos quadros NÃO arquivados do grupo ativo (o ADM sem grupo,
 * todos), na grade do mês pedido (as semanas inteiras) — as TAREFAS que aparecem nele, os EVENTOS cadastrados, os NÚMEROS
 * do cabeçalho, as etiquetas e PESSOAS (filtros), a lista leve das tarefas ABERTAS (o "Criar" escolhe a tarefa) e o que
 * a pessoa deixou OCULTO (a preferência `calendario:ocultos`).
 */
export async function carregarCalendario(u: UsuarioSessao, mesPedido?: string) {
  const grupoAtivo = await getGrupoAtivoId(u);
  const hoje = dataIsoBrasilia(new Date().toISOString());
  const mes = lerMes(mesPedido, hoje);
  const grade = gradeMes(mes.ano, mes.mes);
  const de = grade[0][0];
  const ate = grade.at(-1)?.[6] ?? grade[0][6];
  const quadros = (await listarQuadros(grupoAtivo == null ? (u.role === "admin" ? null : []) : [grupoAtivo], hoje)).filter((q) => !q.arquivado);
  const ids = quadros.map((q) => q.id);
  const [tarefas, eventos, etiquetas, contadores, abertas, prefs] = await Promise.all([
    tarefasDoCalendario(ids, de, ate),
    eventosDosQuadros(ids, de, ate),
    etiquetasDosQuadros(ids),
    contadoresDosQuadros(ids, hoje, semanaDe(hoje)[6]),
    tarefasAbertasLeves(ids),
    listarPreferenciasTabela(u.id, CHAVE_OCULTOS_CALENDARIO),
  ]);
  const pessoas = await pessoasPorIds([u.id, ...tarefas.flatMap((t) => t.pessoas)]);
  return {
    tarefas,
    eventos,
    contadores,
    mes,
    hoje,
    etiquetas,
    pessoas,
    abertas,
    ocultos: lerOcultos(prefs[CHAVE_OCULTOS_CALENDARIO]),
    quadros: quadros.map((q) => ({ id: q.id, nome: q.nome, cor: q.cor })),
  };
}

/**
 * O CONTEXTO de um quadro para abrir UMA tarefa fora dele (o banner da tarefa no Calendário): listas, etiquetas, as
 * pessoas do grupo (+ as designadas na tarefa que estão fora dele) e os modelos de tarefa. `null` = sem acesso.
 */
export async function contextoTarefa(u: UsuarioSessao, tarefaId: number) {
  const r = await tarefaAcessivel(u, tarefaId);
  if (!r) return null;
  const [listas, etiquetas, membros, modelosTarefa] = await Promise.all([
    listasDoQuadro(r.quadro.id),
    etiquetasDoQuadroTodas(r.quadro.id),
    listarPessoasDoGrupo(r.quadro.grupoId),
    listarModelosTarefa(r.quadro.id),
  ]);
  const noGrupo = new Set(membros.map((p) => p.id));
  const fora = [...r.tarefa.pessoas, ...r.tarefa.observadores].filter((p) => !noGrupo.has(p));
  return {
    quadro: { id: r.quadro.id, nome: r.quadro.nome, cor: r.quadro.cor },
    tarefa: r.tarefa,
    listas,
    etiquetas,
    membros: membros.map((p) => p.id),
    pessoas: [...membros, ...(fora.length ? await pessoasPorIds(fora) : [])],
    modelosTarefa,
    podeEditar: u.role === "admin" || u.role === "gestor",
  };
}
export type ContextoTarefa = NonNullable<Awaited<ReturnType<typeof contextoTarefa>>>;

/**
 * O ESPAÇO de um quadro (`/painel/tarefas/[id]`) — tudo o que as abas usam, numa carga: listas, cartões (resumo),
 * etiquetas, as PESSOAS do grupo do quadro (+ as designadas que hoje estão fora dele — seguem visíveis) e as edições
 * salvas da aba Lista, as AUTOMAÇÕES e os MODELOS (de tarefa deste quadro; de quadro do grupo dele). `null` = sem acesso
 * (ou inexistente).
 */
export async function carregarQuadro(u: UsuarioSessao, id: number) {
  const quadro = await quadroAcessivel(u, id);
  if (!quadro) return null;
  const [dados, membros, edicoes, automacoes, modelosTarefa, modelosQuadro] = await Promise.all([
    dadosQuadro(id),
    listarPessoasDoGrupo(quadro.grupoId),
    carregarEdicoes(u.id, prefixoEdicoesTarefas(id)),
    listarAutomacoes(id),
    listarModelosTarefa(id),
    listarModelosQuadro([quadro.grupoId]),
  ]);
  const noGrupo = new Set(membros.map((p) => p.id));
  const fora = [...new Set(dados.tarefas.flatMap((t) => t.pessoas))].filter((p) => !noGrupo.has(p));
  const extras = fora.length ? await pessoasPorIds(fora) : [];
  return {
    quadro,
    ...dados,
    membros: membros.map((p) => p.id),
    pessoas: [...membros, ...extras],
    edicoes,
    automacoes,
    modelosTarefa,
    modelosQuadro: modelosQuadro.map((m) => ({ id: m.id, nome: m.nome, criadoPor: m.criadoPor, listas: m.conteudo.listas.map((l) => l.nome) })),
    hoje: dataIsoBrasilia(new Date().toISOString()),
    podeEditar: u.role === "admin" || u.role === "gestor",
  };
}

export type DadosQuadro = NonNullable<Awaited<ReturnType<typeof carregarQuadro>>>;
