import { carregarEdicoes } from "./edicoes-tabela";
import { alvosVinculoOrcamento, getOrcamentoItens, listarVinculosOrcamento } from "./orcamento";
import { comVinculos, vinculosDaVisao } from "./orcamento-vinculo";
import { listarVisoesOrcamento } from "./pca-espaco";

/**
 * Os dados do COMPARATIVO (a tabela cruzada) de UM orçamento — os MESMOS na tela do orçamento e no espaço do PCA: os
 * lançamentos (com a Unidade/Órgão do CADASTRO pelos vínculos PADRÃO — `comVinculos`), as visões, TODOS os vínculos (o
 * padrão e os de cada visão — a tela aplica os da visão escolhida) + alvos (a Sigla) e as edições salvas que o usuário vê
 * (as dele e as públicas) com a padrão dele. Só escopo de request.
 */
export async function dadosComparativo(orcamentoId: number, usuarioId: number | null) {
  const [itens, visoes, vinculos, alvos, ed] = await Promise.all([
    getOrcamentoItens(orcamentoId),
    listarVisoesOrcamento(),
    listarVinculosOrcamento(),
    alvosVinculoOrcamento(),
    carregarEdicoes(usuarioId, "orcamento-comparativo:"),
  ]);
  return { itens: comVinculos(itens, vinculosDaVisao(vinculos, null), alvos), visoes, vinculos, alvos, edicoes: ed.lista, padroes: ed.padroes };
}
