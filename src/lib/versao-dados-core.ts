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
] as const;

/** A entidade da auditoria conta na versão `dados`? */
export function contaNosDados(entidade: string): boolean {
  return !(FORA_DOS_DADOS as readonly string[]).includes(entidade);
}

/** As entidades que só o módulo de TAREFAS lê (a versão `tarefas`). */
export const DAS_TAREFAS = [
  "tarefa",
  "tarefa_quadro",
  "tarefa_lista",
  "tarefa_etiqueta",
  "tarefa_pasta",
  "tarefa_equipe",
  "tarefa_campo",
  "tarefa_automacao",
  "tarefa_modelo",
  "trello_integracao",
] as const;

/** As entidades da AGENDA (o Calendário soma estas às de Tarefas e aos dados — o cronograma do PCA). */
export const DA_AGENDA = ["agenda_externa", "feriado"] as const;

/** As entidades da EXECUÇÃO (Empenhos, Liquidações, Pagamentos e Execução: as importações da Centi). */
export const DA_EXECUCAO = ["empenho_card", "centi_api"] as const;

/**
 * As ÁREAS da sincronia: cada tela acompanha SÓ a versão do que mostra, para que uma gravação de outra área (a importação
 * automática dos empenhos, um comentário de tarefa) não recarregue a tela aberta nem apague o cache das outras.
 */
export type AreaVersao = "dados" | "tarefas" | "calendario" | "execucao" | "completa";

/** As telas que só leem dados de Mesa/PCA/Orçamento/Catálogo/Verificação (versão `dados`). */
const TELAS_DOS_DADOS = ["/painel/mesa", "/painel/pca", "/painel/orcamento", "/painel/catalogo", "/painel/verificacao"];
const TELAS_DA_EXECUCAO = ["/painel/empenhos", "/painel/liquidacoes", "/painel/pagamentos", "/painel/execucao"];

const em = (p: string, telas: readonly string[]) => telas.some((t) => p === t || p.startsWith(`${t}/`));

/** Qual versão a tela da rota acompanha; as desconhecidas, a completa (recarregar a mais, nunca a menos). */
export function areaDaRota(pathname: string | null | undefined): AreaVersao {
  const p = pathname ?? "";
  if (em(p, TELAS_DOS_DADOS)) return "dados";
  if (em(p, ["/painel/tarefas"])) return "tarefas";
  if (em(p, ["/painel/calendario"])) return "calendario";
  if (em(p, TELAS_DA_EXECUCAO)) return "execucao";
  return "completa";
}

/** As versões, como o servidor as entrega. */
export type VersoesDados = { completa: string; dados: string; tarefas: string; agenda: string; execucao: string };

/** A versão que a tela da rota acompanha (o Calendário = tarefas + agenda + dados: o cronograma do PCA). */
export function versaoDaRota(v: VersoesDados, pathname: string | null | undefined): string {
  switch (areaDaRota(pathname)) {
    case "dados":
      return v.dados;
    case "tarefas":
      return v.tarefas;
    case "calendario":
      return `${v.tarefas}|${v.agenda}|${v.dados}`;
    case "execucao":
      return v.execucao;
    default:
      return v.completa;
  }
}
