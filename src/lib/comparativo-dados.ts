import { carregarEdicoes } from "./edicoes-tabela";
import { alvosVinculoOrcamento, getOrcamentoItens, listarVinculosOrcamento } from "./orcamento";
import { listarVisoesOrcamento } from "./pca-espaco";

/**
 * Os dados do COMPARATIVO (a tabela cruzada) de UM orçamento — os MESMOS na tela do orçamento e no espaço do PCA: os
 * lançamentos, as visões, os vínculos + alvos (a Sigla) e as edições salvas que o usuário vê (as dele e as públicas) com a
 * padrão dele. Só escopo de request.
 */
export async function dadosComparativo(orcamentoId: number, usuarioId: number | null) {
  const [itens, visoes, vinculos, alvos, ed] = await Promise.all([
    getOrcamentoItens(orcamentoId),
    listarVisoesOrcamento(),
    listarVinculosOrcamento(),
    alvosVinculoOrcamento(),
    carregarEdicoes(usuarioId, "orcamento-comparativo:"),
  ]);
  return { itens, visoes, vinculos, alvos, edicoes: ed.lista, padroes: ed.padroes };
}
