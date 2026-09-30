import type { DadoMetricas, MedidaMetricas } from "./mesa-metricas.ts";
import {
  type DetalhesPapel,
  detalhesPadrao,
  type EdicoesTela,
  type LinhasMesa,
  type ModoDadosPessoais,
  type NivelHistorico,
  type NivelResponsavel,
  type SubAcaoMesa,
  TABELAS_MESA,
  type TabelaMesa,
} from "./papeis-detalhes-core.ts";

/**
 * A VISÃO DA MESA de quem está logado — os DETALHES do papel já resolvidos para as duas Mesas (a do sistema e a de cada
 * PCA usam as MESMAS regras; só as ações seguem a Mesa do recurso). Serializável (vai ao cliente dentro do `pode`).
 * Módulo PURO (testado): as telas e as rotas perguntam a ele — nunca deduzem a regra da ausência de um campo.
 *
 * O Administrador vê tudo (`VISAO_TUDO`), com ou sem detalhes gravados (regra firme).
 */
export type VisaoMesa = {
  /** As colunas OCULTAS de cada tabela, JÁ com as de controle próprio (Responsável, Distribuição, Valores). */
  colunasOcultas: Record<TabelaMesa, readonly string[]>;
  responsavel: { ver: boolean; alterar: NivelResponsavel };
  distribuicao: boolean;
  linhas: LinhasMesa;
  desempenho: boolean;
  dadosPessoais: ModoDadosPessoais;
  valores: boolean;
  alteracoes: Record<SubAcaoMesa, boolean>;
  historico: { dfd: NivelHistorico; pca: NivelHistorico };
  edicoes: { dfd: EdicoesTela; pca: EdicoesTela };
};

/** As colunas de VALOR (R$) de cada tabela — seguem o controle "Valores". */
const COLUNAS_VALOR: Record<TabelaMesa, readonly string[]> = {
  protocolos: ["valor"],
  dfds: ["valor"],
  itens: ["vunit", "vtotal"],
  consolidada: ["vmedio", "variacao", "vtotal", "abc"],
};

/** A visão de um papel (o Administrador = tudo). */
export function visaoMesa(d: DetalhesPapel, admin: boolean): VisaoMesa {
  const m = (admin ? detalhesPadrao() : d).mesa;
  const colunasOcultas = {} as Record<TabelaMesa, readonly string[]>;
  for (const t of TABELAS_MESA) {
    const s = new Set(m.colunasOcultas[t]);
    if (t === "protocolos") {
      if (!m.responsavel.ver) s.add("responsavel");
      if (!m.distribuicao) s.add("distribuicao");
    }
    if (!m.valores) for (const c of COLUNAS_VALOR[t]) s.add(c);
    colunasOcultas[t] = [...s];
  }
  const h = (admin ? detalhesPadrao() : d).historico;
  const e = (admin ? detalhesPadrao() : d).edicoes;
  return {
    colunasOcultas,
    responsavel: { ...m.responsavel },
    distribuicao: m.distribuicao,
    linhas: m.linhas,
    desempenho: m.desempenho,
    dadosPessoais: m.dadosPessoais,
    valores: m.valores,
    alteracoes: { ...m.alteracoes },
    historico: { dfd: h.dfd, pca: h.pca },
    edicoes: { dfd: { ...e.dfd }, pca: { ...e.pca } },
  };
}

/** Sem restrição nenhuma (o Administrador; as demonstrações do catálogo). */
export const VISAO_TUDO: VisaoMesa = visaoMesa(detalhesPadrao(), true);

/** As colunas ocultas de uma tabela (para o `Set` das telas). */
export const ocultasDe = (vis: VisaoMesa, tabela: TabelaMesa): ReadonlySet<string> => new Set(vis.colunasOcultas[tabela]);
export const colunaVisivel = (vis: VisaoMesa, tabela: TabelaMesa, chave: string) => !vis.colunasOcultas[tabela].includes(chave);

/** A Mesa precisa de "só os meus" (o servidor filtra as linhas)? */
export const soOsMeus = (vis: VisaoMesa) => vis.linhas === "meus";

// ---------------------------------------------------------------------------------------------------------------
// Responsável: ver e alterar em 3 níveis.
// ---------------------------------------------------------------------------------------------------------------

export const MSG_RESPONSAVEL_NAO = "Seu papel não permite alterar o Responsável.";
export const MSG_RESPONSAVEL_SI = "Seu papel só permite assumir um protocolo sem responsável ou soltar o seu.";

/**
 * Pode trocar o Responsável de `atual` para `novo`? (`null` = pode). Manter o mesmo nunca é recusado. "Só assume para si" =
 * assumir o protocolo SEM responsável ou soltar o seu — tomar o de outra pessoa é redistribuir (exige "qualquer pessoa do
 * grupo"). Quem pode escolher a pessoa (qualquer do grupo) segue a régua do grupo à parte (`pessoaDoGrupo`).
 */
export function motivoResponsavel(vis: VisaoMesa, eu: number, atual: number | null | undefined, novo: number | null | undefined): string | null {
  const a = atual ?? null;
  const n = novo ?? null;
  if (a === n) return null;
  if (!vis.responsavel.ver || vis.responsavel.alterar === "nao") return MSG_RESPONSAVEL_NAO;
  if (vis.responsavel.alterar === "si") {
    if (n === eu && a == null) return null;
    if (n == null && a === eu) return null;
    return MSG_RESPONSAVEL_SI;
  }
  return null;
}

/** A célula do Responsável deste protocolo é editável (há alguma troca permitida)? */
export function podeTrocarResponsavel(vis: VisaoMesa, eu: number | null, atual: number | null | undefined): boolean {
  if (!vis.responsavel.ver || eu == null) return false;
  if (vis.responsavel.alterar === "grupo") return true;
  if (vis.responsavel.alterar === "si") return atual == null || atual === eu;
  return false;
}

/** As pessoas que a célula/edição em massa oferecem: todas do grupo, só a própria pessoa ("só assume"), ou nenhuma. */
export function pessoasDesignaveis<P extends { id: number }>(vis: VisaoMesa, eu: number | null, pessoas: readonly P[]): P[] {
  if (!vis.responsavel.ver || vis.responsavel.alterar === "nao") return [];
  if (vis.responsavel.alterar === "si") return pessoas.filter((p) => p.id === eu);
  return [...pessoas];
}

/** O Responsável PADRÃO (Perfil) entra ao protocolar? "Não altera" = ninguém; "só assume" = só se o padrão é a pessoa. */
export function padraoAoProtocolar(vis: VisaoMesa, eu: number, padrao: number | null | undefined): number | null {
  const p = padrao ?? null;
  if (p == null || !vis.responsavel.ver || vis.responsavel.alterar === "nao") return null;
  if (vis.responsavel.alterar === "si") return p === eu ? p : null;
  return p;
}

/** Pode gravar este Responsável PADRÃO no Perfil? (`null` = pode; manter o mesmo nunca é recusado) */
export function motivoResponsavelPadrao(vis: VisaoMesa, eu: number, atual: number | null | undefined, novo: number | null | undefined): string | null {
  const a = atual ?? null;
  const n = novo ?? null;
  if (a === n || n == null) return null;
  if (!vis.responsavel.ver || vis.responsavel.alterar === "nao") return MSG_RESPONSAVEL_NAO;
  if (vis.responsavel.alterar === "si" && n !== eu) return "Seu papel só permite a própria pessoa como responsável padrão.";
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Dashboard: o que as métricas podem mostrar.
// ---------------------------------------------------------------------------------------------------------------

export type MetricasPermitidas = {
  dados: DadoMetricas[];
  medidas: MedidaMetricas[];
  /** O filtro/foco pelo Responsável do topo (e a KPI "Com responsável"). */
  responsavel: boolean;
  /** Quem protocolou (a Distribuição) aparece (na origem dos dados). */
  distribuicao: boolean;
  /** A tabela "Desempenho por pessoa" e as colunas de pessoa na origem dos dados. */
  desempenho: boolean;
  /** O período (e a data de cada protocolo). */
  periodo: boolean;
  kpiTempo: boolean;
  kpiConformidade: boolean;
  kpiValor: boolean;
};

const TODOS_DADOS: readonly DadoMetricas[] = ["responsavel", "distribuicao", "natureza", "tipo", "situacao", "estado", "unidade", "tempo", "data"];
const TODAS_MEDIDAS: readonly MedidaMetricas[] = ["protocolos", "dfds", "itens", "valor", "correcoes", "acoes"];

/** Tudo permitido (o padrão do Dashboard — o Administrador, as demonstrações). */
export const METRICAS_TODAS: MetricasPermitidas = Object.freeze({
  dados: [...TODOS_DADOS],
  medidas: [...TODAS_MEDIDAS],
  responsavel: true,
  distribuicao: true,
  desempenho: true,
  periodo: true,
  kpiTempo: true,
  kpiConformidade: true,
  kpiValor: true,
});

/** As DADOS/MEDIDAS/KPIs que a visão permite (cada controle tira o que depende do dado oculto). */
export function metricasPermitidas(vis: VisaoMesa): MetricasPermitidas {
  const oc = new Set(vis.colunasOcultas.protocolos);
  const verResp = vis.responsavel.ver;
  const semData = oc.has("data");
  const dados = TODOS_DADOS.filter((d) => {
    if (d === "responsavel") return verResp && vis.desempenho;
    if (d === "distribuicao") return vis.distribuicao && vis.desempenho;
    if (d === "situacao") return !oc.has("situacao");
    if (d === "estado") return !oc.has("estado");
    if (d === "tempo" || d === "data") return !semData;
    return true;
  });
  const medidas = TODAS_MEDIDAS.filter((m) => (m === "acoes" ? vis.desempenho : m === "valor" ? vis.valores : true));
  return {
    dados,
    medidas,
    responsavel: verResp,
    distribuicao: vis.distribuicao,
    desempenho: vis.desempenho,
    periodo: !semData,
    kpiTempo: !semData,
    kpiConformidade: !oc.has("estado"),
    kpiValor: vis.valores,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Alterações campo a campo (o Manipular dividido) e edições salvas.
// ---------------------------------------------------------------------------------------------------------------

/** Pode a sub-ação no recurso? = Manipular na Mesa dele **e** o detalhe. */
export const podeSubAcao = (pode: { manipular: boolean }, vis: VisaoMesa, sub: SubAcaoMesa) => pode.manipular && vis.alteracoes[sub];
