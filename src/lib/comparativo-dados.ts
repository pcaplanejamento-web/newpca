import { carregarEdicoes } from "./edicoes-tabela";
import { alvosVinculoOrcamento, getOrcamentoItens, listarVinculosOrcamento, type OrcamentoItemRow, type OrcamentoResumo } from "./orcamento";
import { lancamentoNaUnidade } from "./escopo-cabecalho-core";
import { comVinculos, mapaVinculos, unidadeDoLancamento, vinculosDaVisao } from "./orcamento-vinculo";
import { listarVisoesOrcamento } from "./pca-espaco";

/**
 * Os dados do COMPARATIVO (a tabela cruzada) de UM orçamento — os MESMOS na tela do orçamento e no espaço do PCA: os
 * lançamentos (com a Unidade/Órgão do CADASTRO pelos vínculos PADRÃO — `comVinculos`), as visões, TODOS os vínculos (o
 * padrão e os de cada visão — a tela aplica os da visão escolhida) + alvos (a Sigla) e as edições salvas que o usuário vê
 * (as dele e as públicas) com a padrão dele. Só escopo de request.
 */
/** A unidade do CABEÇALHO: só os lançamentos vinculados a ela (pelos vínculos PADRÃO; os sem vínculo conforme o ADM). */
export type UnidadeDosLancamentos = { id: number | false; semVinculo: boolean } | null;

/** Os lançamentos da unidade (todos sem `rep`). */
export function lancamentosDaUnidade<T extends { unidade: string | null; acao: string | null }>(
  itens: T[],
  vinculos: Parameters<typeof vinculosDaVisao>[0],
  rep: UnidadeDosLancamentos,
): T[] {
  if (!rep) return itens;
  if (rep.id === false) return [];
  const id = rep.id;
  const mapa = mapaVinculos(vinculosDaVisao(vinculos, null));
  return itens.filter((i) => lancamentoNaUnidade(unidadeDoLancamento(mapa, i.unidade, i.acao), id, rep.semVinculo));
}

export async function dadosComparativo(orcamentoId: number, usuarioId: number | null, rep: UnidadeDosLancamentos = null) {
  const [itens, visoes, vinculos, alvos, ed] = await Promise.all([
    getOrcamentoItens(orcamentoId),
    listarVisoesOrcamento(),
    listarVinculosOrcamento(),
    alvosVinculoOrcamento(),
    carregarEdicoes(usuarioId, "orcamento-comparativo:"),
  ]);
  return { itens: comVinculos(lancamentosDaUnidade(itens, vinculos, rep), vinculosDaVisao(vinculos, null), alvos), visoes, vinculos, alvos, edicoes: ed.lista, padroes: ed.padroes };
}

/** O resumo (cards e cabeçalho do orçamento) só dos lançamentos dados — a mesma conta da agregação no banco. */
export function resumoDosLancamentos(base: OrcamentoResumo, itens: OrcamentoItemRow[]): OrcamentoResumo {
  const soma = (k: keyof OrcamentoItemRow) => itens.reduce((s, i) => s + Number(i[k] ?? 0), 0);
  const distintos = (k: keyof OrcamentoItemRow) => new Set(itens.map((i) => i[k]).filter((v) => v != null && v !== "")).size;
  return {
    ...base,
    totalItens: itens.length,
    valorInicial: soma("valorInicial"),
    suplementacao: soma("valorSuplementacao"),
    anulacao: soma("valorAnulacao"),
    reducao: soma("valorReducao"),
    qtdEmpenho: soma("qtdEmpenho"),
    empenho: soma("valorEmpenho"),
    saldo: soma("saldo"),
    emenda: soma("valorEmendaImpositiva"),
    orgaos: distintos("orgao"),
    unidades: distintos("unidade"),
    programas: distintos("programa"),
    acoes: distintos("acao"),
  };
}

/** Os resumos dos orçamentos recalculados SÓ com os lançamentos da unidade do cabeçalho (sem `rep`, os do banco). */
export async function resumosNaUnidade(resumos: OrcamentoResumo[], rep: UnidadeDosLancamentos): Promise<OrcamentoResumo[]> {
  if (!rep || resumos.length === 0) return resumos;
  const vinculos = await listarVinculosOrcamento();
  return Promise.all(resumos.map(async (o) => resumoDosLancamentos(o, lancamentosDaUnidade(await getOrcamentoItens(o.id), vinculos, rep))));
}
