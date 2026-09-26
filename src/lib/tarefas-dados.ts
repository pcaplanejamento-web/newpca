import type { UsuarioSessao } from "./auth";
import { carregarEdicoes } from "./edicoes-tabela";
import { dataIsoBrasilia } from "./format";
import { abasPermitidas, getGrupoAtivo, getGrupoAtivoId, gruposDoUsuario } from "./grupos";
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
  LIMITE_EVENTOS_CALENDARIO,
  LIMITE_TAREFAS_CALENDARIO,
  tarefaAcessivel,
  tarefasAbertasLeves,
  tarefasDoCalendario,
} from "./tarefas";
import { assinaturaDaPessoa } from "./calendario-assinatura";
import { CHAVE_OPCOES_CALENDARIO, lerOpcoesCalendario } from "./calendario-core";
import { listarFeriados } from "./feriados";
import { cronogramaPcas } from "./pca-espaco";
import { listarPreferenciasTabela } from "./preferencias-tabela";
import { CHAVE_OCULTOS_CALENDARIO, gradeMes, lerMes, lerOcultos, prefixoEdicoesTarefas, semanaDe } from "./tarefas-core";

/** O prefixo das preferências do calendário (o que fica oculto + as opções da pessoa). */
const PREFIXO_CALENDARIO = "calendario:";

/** As preferências do CALENDÁRIO da pessoa (ocultos + opções) e os FERIADOS cadastrados — o módulo e a aba do quadro. */
export async function preferenciasCalendario(usuarioId: number) {
  const [prefs, feriados] = await Promise.all([listarPreferenciasTabela(usuarioId, PREFIXO_CALENDARIO), listarFeriados()]);
  return { ocultos: lerOcultos(prefs[CHAVE_OCULTOS_CALENDARIO]), opcoes: lerOpcoesCalendario(prefs[CHAVE_OPCOES_CALENDARIO]), feriados };
}
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
 * todos), na grade do mês pedido (as semanas inteiras — pela semana que a PESSOA escolheu) — as TAREFAS que aparecem nele,
 * os EVENTOS cadastrados, os NÚMEROS do cabeçalho, as etiquetas e PESSOAS (filtros), a lista leve das tarefas ABERTAS (o
 * "Criar" escolhe a tarefa), as preferências (ocultos + opções), os FERIADOS cadastrados, o CRONOGRAMA do PCA (quem vê o
 * módulo PCA), se a pessoa tem LINK DE ASSINATURA e `truncado` (alguma carga bateu no teto — a tela avisa).
 */
export async function carregarCalendario(u: UsuarioSessao, mesPedido?: string) {
  const grupo = await getGrupoAtivo(u);
  const grupoAtivo = grupo?.id ?? null;
  const hoje = dataIsoBrasilia(new Date().toISOString());
  const mes = lerMes(mesPedido, hoje);
  const [prefs, abas] = await Promise.all([preferenciasCalendario(u.id), abasPermitidas(u, grupo)]);
  const inicio = prefs.opcoes.inicioSegunda ? 1 : 0;
  const grade = gradeMes(mes.ano, mes.mes, inicio);
  const de = grade[0][0];
  const ate = grade.at(-1)?.[6] ?? grade[0][6];
  const quadros = (await listarQuadros(grupoAtivo == null ? (u.role === "admin" ? null : []) : [grupoAtivo], hoje)).filter((q) => !q.arquivado);
  const ids = quadros.map((q) => q.id);
  const [tarefas, eventos, etiquetas, contadores, abertas, assinatura, pca] = await Promise.all([
    tarefasDoCalendario(ids, de, ate),
    eventosDosQuadros(ids, de, ate),
    etiquetasDosQuadros(ids),
    contadoresDosQuadros(ids, hoje, semanaDe(hoje, inicio)[6]),
    tarefasAbertasLeves(ids),
    assinaturaDaPessoa(u.id),
    abas.has("pca") ? cronogramaPcas(de, ate) : Promise.resolve({ pcas: [], dfds: [] }),
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
    ...prefs,
    pca,
    assinatura: assinatura != null,
    truncado: tarefas.length >= LIMITE_TAREFAS_CALENDARIO || eventos.length >= LIMITE_EVENTOS_CALENDARIO || abertas.length >= LIMITE_TAREFAS_CALENDARIO,
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
