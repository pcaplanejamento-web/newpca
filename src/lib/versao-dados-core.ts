/**
 * VERSÃO DOS DADOS POR ÁREA (puro, testado) — o que a versão `dados` NÃO conta e qual versão cada tela usa.
 *
 * A versão `completa` conta TODA escrita (menos login/logout/sessão). A versão `dados` é a mesma SEM os módulos de
 * TAREFAS e AGENDA, que nenhuma carga da Mesa, do PCA, do Orçamento, do Catálogo nem da Verificação lê — assim um
 * comentário de tarefa ou a sincronia do Trello não recalculam o Dashboard nem recarregam a Mesa aberta. É uma lista de
 * EXCLUSÃO: toda entidade nova ou desconhecida continua contando (invalidar a mais, nunca a menos).
 */
export const FORA_DOS_DADOS = [
  "termo_uso",
  "aparelho",
  "tarefa",
  "tarefa_quadro",
  "tarefa_lista",
  "tarefa_etiqueta",
  "tarefa_pasta",
  "tarefa_equipe",
  "tarefa_campo",
  "tarefa_automacao",
  "tarefa_modelo",
  "agenda_externa",
  "trello_integracao",
  "feriado",
  "centi_api",
  "empenho_card",
  "frota",
  "veiculo",
] as const;

/** A entidade da auditoria conta na versão `dados`? */
export function contaNosDados(entidade: string): boolean {
  return !(FORA_DOS_DADOS as readonly string[]).includes(entidade);
}

export type AreaVersao = "dados" | "completa";

/** As telas que só leem dados de Mesa/PCA/Orçamento/Catálogo/Verificação (versão `dados`). */
const TELAS_DOS_DADOS = ["/painel/mesa", "/painel/pca", "/painel/orcamento", "/painel/catalogo", "/painel/verificacao"];

/** Qual versão a tela da rota acompanha: as telas dos dados → `dados`; todas as outras (e as desconhecidas) → `completa`. */
export function areaDaRota(pathname: string | null | undefined): AreaVersao {
  const p = pathname ?? "";
  return TELAS_DOS_DADOS.some((t) => p === t || p.startsWith(`${t}/`)) ? "dados" : "completa";
}

/** As duas versões, como o servidor as entrega. */
export type VersoesDados = { completa: string; dados: string };

/** A versão que a tela da rota acompanha. */
export function versaoDaRota(v: VersoesDados, pathname: string | null | undefined): string {
  return areaDaRota(pathname) === "dados" ? v.dados : v.completa;
}
