import { type AlvosVinculo, comVinculos, mapaVinculos, unidadeDoLancamento, type VinculoOrcamento, vinculosDaVisao } from "./orcamento-vinculo.ts";
import { aplicarVisao, type AusentesVisao, type LinhaOrcamentoVisao, valoresAusentes, type VisaoOrcamento } from "./orcamento-visao.ts";

type ItemCubo = LinhaOrcamentoVisao & {
  id: number;
  orgao: string | null;
  unidade: string | null;
  acao: string | null;
  nomeElemento: string | null;
  codigoElemento: string | null;
  valorInicial: number | null;
};

/**
 * O orçamento do PCA numa VISÃO escolhida na tela, calculado NO NAVEGADOR sobre os lançamentos já carregados (a MESMA régua
 * do servidor — `calcularOrcamentoDoPca`): os vínculos da visão, o filtro da visão e a unidade de cada lançamento pela ação.
 */
export function orcamentoNaVisao(itens: ItemCubo[], vinculos: VinculoOrcamento[], visao: VisaoOrcamento | null, alvos: AlvosVinculo) {
  const vincs = vinculosDaVisao(vinculos, visao);
  const mapa = mapaVinculos(vincs);
  const bruto = itens.reduce((s, i) => s + Number(i.valorInicial ?? 0), 0);
  const ausentes: AusentesVisao = valoresAusentes(itens, visao?.filtros);
  const f = aplicarVisao(comVinculos(itens, vincs, alvos), visao?.filtros);
  const linhas = f.map((i) => ({
    id: i.id,
    orgao: i.orgao,
    unidade: i.unidade,
    nomeElemento: i.nomeElemento,
    codigoElemento: i.codigoElemento,
    unidadeId: unidadeDoLancamento(mapa, i.unidade, i.acao),
    valor: Number(i.valorInicial ?? 0),
  }));
  return { bruto, filtrado: linhas.reduce((s, l) => s + l.valor, 0), linhas, ausentes, visaoNome: visao?.nome ?? null, visaoId: visao?.id ?? null };
}
