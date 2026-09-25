import type { UsuarioSessao } from "./auth";
import { carregarEdicoes } from "./edicoes-tabela";
import { dataIsoBrasilia } from "./format";
import { getGrupoAtivoId, gruposDoUsuario } from "./grupos";
import { dadosQuadro, listarAutomacoes, listarModelosQuadro, listarModelosTarefa, listarQuadros, quadroAcessivel } from "./tarefas";
import { prefixoEdicoesTarefas } from "./tarefas-core";
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
