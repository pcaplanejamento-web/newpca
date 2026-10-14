import { type AcaoPapel, ACOES_PAPEL, CATALOGO_PAPEIS, type Tela } from "./papeis-catalogo.ts";

type PodeTela = Readonly<Record<AcaoPapel, boolean>>;

/**
 * COMPONENTES DO PAPEL — o controle MINUCIOSO dentro de cada tela. Módulo PURO (cliente e servidor; testado).
 *
 * As 6 ações do papel (`papeis-core.ts`) valem para a TELA inteira; aqui o ADM RETIRA uma ação de UM COMPONENTE da tela
 * (uma aba, uma visão, uma tabela): ex. a Mesa abre, mas sem o Dashboard; o Catálogo exporta, mas não o Histórico de
 * compra. O efetivo = a ação na tela **e** o componente não a retirou. O Administrador ignora (regra firme).
 *
 * Gravado em `papeis.detalhes.componentes` como LISTA NEGATIVA (`{ chave: ações retiradas }`) — um componente novo
 * nasce liberado, e o papel sem nada continua igual a antes.
 */

export type InfoComponente = {
  /** "tela.componente" — a chave gravada. */
  chave: string;
  tela: Tela;
  rotulo: string;
  /** O que é o componente (o (?) do editor). */
  descricao: string;
  /** As ações que se aplicam a ele e o que cada uma cobre ali. */
  acoes: Partial<Record<AcaoPapel, string>>;
};

const c = (tela: Tela, nome: string, rotulo: string, descricao: string, acoes: Partial<Record<AcaoPapel, string>>): InfoComponente => ({
  chave: `${tela}.${nome}`,
  tela,
  rotulo,
  descricao,
  acoes,
});

/** O catálogo — a fonte única do editor, da validação e da aplicação. */
export const CATALOGO_COMPONENTES: readonly InfoComponente[] = [
  // Mesa
  c("dfd", "dashboard", "Dashboard de governança", "O ícone do Dashboard na barra da Mesa: KPIs, métricas e desempenho por pessoa.", {
    visualizar: "Abrir o Dashboard da Mesa.",
  }),
  c("dfd", "protocolos", "Protocolos", "A visão Protocolos da Mesa (a tabela e o banner do protocolo).", {
    visualizar: "Ver a visão Protocolos.",
    importar: "O botão “Importar protocolo” e o “Reenviar protocolo”.",
    exportar: "Baixar a tabela de protocolos (.xlsx/PDF).",
    excluir: "A lixeira dos protocolos (exclui com os DFDs).",
  }),
  c("dfd", "dfds", "DFDs", "A visão DFDs da Mesa (a planilha e o banner do DFD).", {
    visualizar: "Ver a visão DFDs.",
    importar: "O botão “Importar DFD” e o “Sobrescrever DFD”.",
    exportar: "Baixar a planilha de DFDs (.xlsx/PDF).",
    excluir: "Excluir DFDs.",
  }),
  c("dfd", "itens", "Itens", "A visão Itens da Mesa (um item por linha).", {
    visualizar: "Ver a visão Itens.",
    exportar: "Baixar a tabela de itens (.xlsx/PDF).",
  }),
  c("dfd", "consolidada", "Itens consolidados", "A visão Consolidada dos itens (uma linha por código, com médias e curva ABC).", {
    visualizar: "Ver a visão Consolidada.",
    exportar: "Baixar a Consolidada (.xlsx/PDF).",
  }),
  // PCA
  c("pca", "dashboard", "Dashboard do PCA", "A aba Dashboard do espaço do PCA: KPIs, gráficos e a consulta.", {
    visualizar: "Abrir o Dashboard do PCA.",
    exportar: "Relatório em PDF, gráficos em PNG e as tabelas da consulta.",
  }),
  c("pca", "orcamento", "Orçamento do PCA", "A aba Orçamento do PCA (PCA × Orçamento e Comparativo).", {
    visualizar: "Abrir o Orçamento do PCA.",
    exportar: "Baixar o comparativo e o relatório da composição.",
  }),
  c("pca", "visaoDetalhes", "Configurações da visão", "O olho ao lado da Visão no PCA × Orçamento: abre os filtros e os vínculos da visão em uso, só para consulta.", {
    visualizar: "Ver as configurações da visão do orçamento (sem alterar).",
  }),
  c("pca", "mesa", "Mesa do PCA", "A aba Mesa (PCA de protocolos) com os protocolos enviados e incorporados.", {
    visualizar: "Abrir a Mesa do PCA.",
    exportar: "Baixar as tabelas da Mesa do PCA.",
  }),
  c("pca", "importacao", "Importação (planilhas)", "A aba Importação do PCA de lista (as planilhas).", {
    visualizar: "Abrir a Importação.",
    importar: "Importar planilhas.",
    excluir: "Excluir planilhas.",
  }),
  c("pca", "configuracao", "Configuração do PCA", "A aba Configuração do espaço do PCA (nome, ano, publicar, capa, visão).", {
    visualizar: "Abrir a Configuração do PCA.",
    configurar: "Alterar a Configuração do PCA.",
  }),
  // Catálogo
  c("catalogo", "catalogos", "Catálogos (cards)", "A visão Catálogo: os cards dos catálogos da agenda e as pastas.", {
    visualizar: "Ver os catálogos.",
    importar: "Importar catálogo e atualizar (re-subir).",
    exportar: "Baixar o catálogo (.xlsx/PDF).",
    excluir: "Excluir catálogos.",
  }),
  c("catalogo", "lista", "Lista de itens", "A visão Lista de Itens: todos os itens numa tabela.", {
    visualizar: "Ver a Lista de Itens.",
    exportar: "Baixar a lista (.xlsx/PDF).",
  }),
  c("catalogo", "historico", "Histórico de compra", "Os catálogos do tipo Histórico de compra (contratos e produtos).", {
    visualizar: "Abrir os históricos de compra.",
    importar: "Importar um histórico de compra.",
    exportar: "Baixar o histórico (.xlsx).",
  }),
  c("catalogo", "unidades", "Unidades de medida", "A visão Unidades de medida (padronização).", {
    visualizar: "Ver as Unidades de medida.",
    configurar: "Cadastrar unidades e sinônimos.",
  }),
  c("catalogo", "classificacoes", "Classificações", "A visão Classificações dos itens (padronização).", {
    visualizar: "Ver as Classificações.",
    configurar: "Cadastrar classificações e palavras-chave.",
  }),
  // Orçamento
  c("orcamento", "lancamentos", "Lançamentos", "A aba Lançamentos do orçamento (as linhas do CUBO).", {
    visualizar: "Abrir os Lançamentos.",
    importar: "Reenviar a planilha.",
    exportar: "Baixar os lançamentos (.xlsx/PDF).",
  }),
  c("orcamento", "comparativo", "Comparativo", "A aba Comparativo (a tabela cruzada).", {
    visualizar: "Abrir o Comparativo.",
    exportar: "Baixar a tabela cruzada (.xlsx/PDF).",
  }),
  c("orcamento", "vinculos", "Vínculos", "A aba Vínculos (unidade do CUBO → unidade cadastrada).", {
    visualizar: "Abrir os Vínculos.",
    configurar: "Criar, editar e excluir vínculos.",
  }),
  c("orcamento", "visoes", "Visões", "A aba Visões (os filtros salvos do orçamento).", {
    visualizar: "Abrir as Visões.",
    configurar: "Criar, editar e excluir visões.",
  }),
  // Tarefas
  c("tarefas", "dashboard", "Dashboard do quadro", "A vista Dashboard do quadro de tarefas.", { visualizar: "Abrir o Dashboard do quadro." }),
  c("tarefas", "lista", "Lista", "A vista Lista do quadro (a tabela das tarefas).", {
    visualizar: "Abrir a Lista.",
    exportar: "Baixar a Lista (.xlsx/PDF) e o PDF de cada lista do quadro.",
  }),
  c("tarefas", "calendario", "Calendário do quadro", "A vista Calendário dentro do quadro.", { visualizar: "Abrir o Calendário do quadro." }),
  c("tarefas", "configuracao", "Configuração do quadro", "A vista Configuração do quadro (cor, equipes, campos, automações, Trello).", {
    visualizar: "Abrir a Configuração do quadro.",
    importar: "Importar do Trello.",
  }),
  // Calendário
  c("calendario", "agendas", "Outras agendas", "As agendas externas (.ics) assinadas pela pessoa.", {
    visualizar: "Ver as agendas externas.",
    importar: "Assinar uma agenda externa.",
  }),
  c("calendario", "assinatura", "Exportar e assinar", "Baixar o .ics e o link de assinatura do Calendário.", { exportar: "Baixar .ics e gerar o link." }),
  // Verificação
  c("verificacao", "protocolo", "Verificar protocolo", "Conferir um protocolo em PDF na Verificação.", { visualizar: "Usar a verificação de protocolo." }),
  c("verificacao", "dfd", "Verificar DFD", "Conferir um DFD (.pdf/.xlsx) na Verificação.", { visualizar: "Usar a verificação de DFD." }),
];

const POR_CHAVE = new Map(CATALOGO_COMPONENTES.map((x) => [x.chave, x]));
export const componente = (chave: string) => POR_CHAVE.get(chave);
export const componentesDaTela = (tela: Tela) => CATALOGO_COMPONENTES.filter((x) => x.tela === tela);
/** As ações do componente na ordem do sistema (só as que a TELA também tem). */
export const acoesDoComponente = (x: InfoComponente): AcaoPapel[] =>
  ACOES_PAPEL.filter((a) => x.acoes[a] != null && CATALOGO_PAPEIS[x.tela].acoes[a] != null);

/** As ações RETIRADAS por componente (lista negativa). */
export type ComponentesRetirados = Record<string, AcaoPapel[]>;

/**
 * Normaliza (lixo = nada retirado): só componentes e ações do catálogo, sem repetir, na ordem; retirar Visualizar retira
 * TODAS as ações do componente (não se exporta o que não se vê).
 */
export function coerceComponentes(bruto: unknown): ComponentesRetirados {
  const o = bruto && typeof bruto === "object" && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : {};
  const out: ComponentesRetirados = {};
  for (const x of CATALOGO_COMPONENTES) {
    const v = o[x.chave];
    if (!Array.isArray(v)) continue;
    const pedidas = new Set(v.filter((a): a is string => typeof a === "string"));
    const acoes = acoesDoComponente(x);
    const lista = pedidas.has("visualizar") && acoes.includes("visualizar") ? acoes : acoes.filter((a) => pedidas.has(a));
    if (lista.length) out[x.chave] = lista;
  }
  return out;
}

/** O componente tem a ação RETIRADA pelo papel? (o Administrador nunca) */
export const retirado = (r: ComponentesRetirados | undefined, chave: string, acao: AcaoPapel, admin = false): boolean =>
  !admin && !!r?.[chave]?.includes(acao);

/** O efetivo: a ação na tela **e** não retirada no componente. */
export const podeNoComponente = (pode: PodeTela, r: ComponentesRetirados | undefined, chave: string, acao: AcaoPapel, admin = false): boolean =>
  pode[acao] && !retirado(r, chave, acao, admin);

/** Liga/desliga uma ação de um componente (normalizado). `liberar=false` = retirar. */
export function alternarAcaoComponente(r: ComponentesRetirados, chave: string, acao: AcaoPapel, liberar: boolean): ComponentesRetirados {
  const atual = new Set(r[chave] ?? []);
  if (liberar) {
    atual.delete(acao);
    // Liberar outra ação libera também ver o componente.
    if (acao !== "visualizar") atual.delete("visualizar");
  } else atual.add(acao);
  return coerceComponentes({ ...r, [chave]: [...atual] });
}

/** A 1ª opção que o papel VÊ entre as dadas (as vistas de uma tela) — a vista pedida, se ainda se vê. */
export function vistaPermitida<V extends string>(pedida: V, opcoes: readonly V[], ve: (v: V) => boolean): V {
  if (ve(pedida)) return pedida;
  return opcoes.find(ve) ?? pedida;
}

/** As linhas do resumo/diff: "Componente (Tela): ações retiradas". */
export function resumoComponentes(r: ComponentesRetirados, rotuloTela: (t: Tela) => string, rotuloAcao: (a: AcaoPapel) => string) {
  return Object.entries(r).flatMap(([chave, acoes]) => {
    const x = componente(chave);
    if (!x || !acoes.length) return [];
    return [{ tela: x.tela, rotulo: `${x.rotulo} (${rotuloTela(x.tela)})`, valor: acoes.includes("visualizar") ? "Oculto" : `Sem ${acoes.map(rotuloAcao).join(", ")}` }];
  });
}
