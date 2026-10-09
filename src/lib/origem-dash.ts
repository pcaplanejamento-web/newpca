/**
 * ORIGEM DOS DADOS dos gráficos do Dashboard — núcleo PURO (testado). Um clique numa fatia/barra vira um
 * RECORTE, e `itensDoRecorte` devolve os itens que formam aquele número com a MESMA chave de agrupamento
 * dos gráficos (`fatias` do `pca-core` e as consultas de `queries.ts`: valor vazio = "—").
 */

import type { PeriodoPrevisao } from "./normalize.ts";
import { agregarDashboard, type ItemDashboard } from "./pca-core.ts";

export type RecorteDash =
  | { dim: "classificacao"; labels: string[] }
  | { dim: "unidadeMedida"; labels: string[] }
  | { dim: "prioridade"; labels: string[] }
  | { dim: "unidade"; labels: string[] }
  /** A DEFINIÇÃO da previsão: "Mês definido", a periodicidade genérica ("Anual"…) ou "Sem previsão" (`previsaoDoItem`). */
  | { dim: "previsao"; labels: string[] }
  /** Os itens com o MÊS definido (os genéricos ficam fora — têm a dimensão `previsao`); `extras` = vários meses. */
  | { dim: "mes"; ano: number; mes: number; extras?: { ano: number; mes: number }[] }
  | { dim: "item"; id: number };

/** O mínimo de um item p/ o recorte (o `ItemRow` do dashboard). */
export type ItemRecortavel = {
  id: number;
  classificacao: string | null;
  unidadeMedida: string | null;
  ano?: number | null;
  mes?: number | null;
  /** Previsão GENÉRICA (fonte protocolo — sem mês definido; a periodicidade em `periodo`). */
  anual?: boolean;
  /** A periodicidade da previsão genérica (ANUAL/SEMESTRAL/QUADRIMESTRAL/TRIMESTRAL; ausente = ANUAL). */
  periodo?: string | null;
  /** Prioridade do DFD de origem (ALTA/MÉDIA/BAIXA; fonte protocolo). */
  prioridade?: string | null;
  /** Sigla da unidade (requisitante ou planilha). */
  codigo?: string | null;
};

const chave = (v: string | null | undefined) => v || "—";

/** As DEFINIÇÕES da previsão no Dashboard, na ordem dos gráficos, com a cor de cada uma (tokens). */
export const PREVISOES_DASH = [
  { chave: "Mês definido", cor: "var(--accent)" },
  { chave: "Anual", cor: "var(--serie-2)" },
  { chave: "Semestral", cor: "var(--serie-3)" },
  { chave: "Quadrimestral", cor: "var(--serie-5)" },
  { chave: "Trimestral", cor: "var(--serie-6)" },
  { chave: "Sem previsão", cor: "var(--faint)" },
] as const;
/** As definições GENÉRICAS (sem mês — a periodicidade ao longo do ano do PCA). */
export const PREVISOES_GENERICAS = ["Anual", "Semestral", "Quadrimestral", "Trimestral"];
const ROTULO_PERIODO: Record<string, string> = { ANUAL: "Anual", SEMESTRAL: "Semestral", QUADRIMESTRAL: "Quadrimestral", TRIMESTRAL: "Trimestral" };

/** A definição da previsão de um item: "Mês definido", a periodicidade genérica ou "Sem previsão". */
export function previsaoDoItem(i: ItemRecortavel): string {
  if (i.ano == null) return "Sem previsão";
  if (i.anual) return ROTULO_PERIODO[i.periodo ?? "ANUAL"] ?? "Anual";
  return i.mes != null ? "Mês definido" : "Sem previsão";
}
const ordemPrevisao = (c: string) => {
  const k = PREVISOES_DASH.findIndex((p) => p.chave === c);
  return k < 0 ? PREVISOES_DASH.length : k;
};

/** O campo de cada dimensão por rótulo (a MESMA chave dos gráficos: vazio = "—"). */
const CAMPO = {
  classificacao: (i: ItemRecortavel) => i.classificacao,
  unidadeMedida: (i: ItemRecortavel) => i.unidadeMedida,
  prioridade: (i: ItemRecortavel) => i.prioridade,
  unidade: (i: ItemRecortavel) => i.codigo,
  previsao: previsaoDoItem,
};

/** Itens do recorte (a MESMA chave de agrupamento dos gráficos). No recorte de MÊS, só os itens com o mês definido. */
export function itensDoRecorte<T extends ItemRecortavel>(itens: T[], r: RecorteDash): { itens: T[] } {
  if (r.dim === "item") return { itens: itens.filter((i) => i.id === r.id) };
  if (r.dim === "mes") {
    // Vários meses (o filtro do topo): o item entra se casa QUALQUER um.
    const alvos = [{ ano: r.ano, mes: r.mes }, ...(r.extras ?? [])];
    return { itens: itens.filter((i) => !i.anual && alvos.some((a) => i.ano === a.ano && i.mes === a.mes)) };
  }
  const set = new Set(r.labels);
  const campo = CAMPO[r.dim] as (i: T) => string | null | undefined;
  return { itens: itens.filter((i) => set.has(chave(campo(i)))) };
}

// ---------------------------------------------------------------------------
// FILTRO CRUZADO do Dashboard: tocar numa fatia/barra FILTRA os demais gráficos, os KPIs e a Consulta. Um filtro por
// DIMENSÃO (a do gráfico tocado); entre dimensões vale o E. Cada gráfico é agregado SEM o filtro da própria dimensão
// (mostra todas as fatias, com a escolhida em destaque) — o padrão de filtro cruzado.
// ---------------------------------------------------------------------------

export type DimDash = RecorteDash["dim"];

/** Um filtro ativo: o recorte + o texto do chip. */
export type FiltroDash = { recorte: RecorteDash; rotulo: string };
export type FiltrosDash = Partial<Record<DimDash, FiltroDash>>;

const chaveRecorte = (r: RecorteDash): string =>
  r.dim === "item" ? `i:${r.id}` : r.dim === "mes" ? `m:${[{ ano: r.ano, mes: r.mes }, ...(r.extras ?? [])].map((a) => `${a.ano}-${a.mes}`).sort().join("|")}` : `${r.dim}:${[...r.labels].sort().join("|")}`;

/** Mesmo recorte (a chave do destaque e do alternar). */
export const mesmoRecorte = (a: RecorteDash | undefined, b: RecorteDash): boolean => a != null && chaveRecorte(a) === chaveRecorte(b);

/** Tocar de novo no MESMO recorte tira o filtro; outro valor da mesma dimensão troca; outra dimensão soma (E). */
export function alternarFiltro(f: FiltrosDash, recorte: RecorteDash, rotulo: string): FiltrosDash {
  const atual = f[recorte.dim];
  const novo = { ...f };
  if (mesmoRecorte(atual?.recorte, recorte)) delete novo[recorte.dim];
  else novo[recorte.dim] = { recorte, rotulo };
  return novo;
}

/** Os itens que passam em TODOS os filtros (menos o da dimensão `exceto` — a do gráfico que se desenha). */
export function filtrarItensDash<T extends ItemRecortavel>(itens: T[], filtros: FiltrosDash, exceto?: DimDash): T[] {
  let lista = itens;
  for (const [dim, f] of Object.entries(filtros) as [DimDash, FiltroDash | undefined][]) {
    if (!f || dim === exceto) continue;
    lista = itensDoRecorte(lista, f.recorte).itens;
  }
  return lista;
}

export const temFiltro = (f: FiltrosDash): boolean => Object.values(f).some(Boolean);

/** O mínimo de um item p/ AGREGAR o Dashboard no navegador (o `ItemRow`). */
export type ItemAgregavel = ItemRecortavel & {
  idProduto: string | null;
  sequencial: number | null;
  nomeProduto: string | null;
  quantidade: number | null;
  valorReferencia: number | null;
  valorTotal: number | null;
  /** Sigla da unidade (requisitante ou planilha). */
  codigo: string | null;
};

/** O item da lista → o item da agregação (as MESMAS chaves das consultas/`agregarDashboard`: classificação vazia = "—"). */
function paraDashboard(i: ItemAgregavel): ItemDashboard {
  return {
    id: i.id,
    codigoProduto: i.idProduto,
    sequencial: i.sequencial,
    nome: i.nomeProduto,
    unidadeMedida: i.unidadeMedida,
    quantidade: i.quantidade,
    valorUnitario: i.valorReferencia,
    valorTotal: Number(i.valorTotal ?? 0),
    classificacao: i.classificacao ?? "",
    previsao:
      i.ano == null
        ? null
        : i.anual
          ? { ano: i.ano, anual: true, ...(i.periodo ? { periodo: i.periodo as PeriodoPrevisao } : {}) }
          : i.mes != null
            ? { ano: i.ano, mes: i.mes }
            : null,
    unidade: i.codigo,
    origem: null,
  };
}

/** KPIs + fatias + cronograma + top a partir da lista de itens (no navegador, para o filtro cruzado). */
export function agregarItensDash(itens: ItemAgregavel[]) {
  return agregarDashboard(itens.map(paraDashboard));
}

/** Fatias por um campo (rótulo vazio = "—"), pelo valor. */
export function fatiasDash(itens: ItemAgregavel[], dim: "prioridade" | "unidade" | "previsao") {
  const m = new Map<string, { label: string; total: number; count: number }>();
  for (const i of itens) {
    const k = chave(CAMPO[dim](i));
    const f = m.get(k) ?? { label: k, total: 0, count: 0 };
    f.total += Number(i.valorTotal ?? 0);
    f.count += 1;
    m.set(k, f);
  }
  return [...m.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"));
}

export type FatiaPrevisao = { label: string; total: number; count: number; pct: number };

/** Uma linha por definição da lista dada (as zeradas também — o quadro fica estável), com a participação no valor. */
function linhasPrevisao(itens: ItemAgregavel[], grupos: readonly { label: string; chaves: readonly string[] }[]): FatiaPrevisao[] {
  const linhas = grupos.map((g) => ({ label: g.label, chaves: new Set(g.chaves), total: 0, count: 0 }));
  for (const i of itens) {
    const l = linhas.find((x) => x.chaves.has(previsaoDoItem(i)));
    if (!l) continue;
    l.total += Number(i.valorTotal ?? 0);
    l.count += 1;
  }
  const soma = linhas.reduce((s, l) => s + l.total, 0);
  return linhas.map(({ label, total, count }) => ({ label, total, count, pct: soma > 0 ? (total / soma) * 100 : 0 }));
}

/** MÊS DEFINIDO × GENÉRICO × SEM PREVISÃO (o quadro "Definição da previsão"; Σ = o valor dos itens). */
export const DEFINICAO_GRUPOS = [
  { label: "Mês definido", chaves: ["Mês definido"] },
  { label: "Genérico", chaves: PREVISOES_GENERICAS },
  { label: "Sem previsão", chaves: ["Sem previsão"] },
] as const;
export const definicaoDash = (itens: ItemAgregavel[]): FatiaPrevisao[] => linhasPrevisao(itens, DEFINICAO_GRUPOS);

/** Os itens GENÉRICOS por periodicidade (o quadro "Contratações periódicas" — só as que existem). */
export const periodicosDash = (itens: ItemAgregavel[]): FatiaPrevisao[] =>
  linhasPrevisao(
    itens,
    PREVISOES_GENERICAS.map((g) => ({ label: g, chaves: [g] })),
  ).filter((f) => f.count > 0);

export type ModoCronograma = "mensal" | "acumulado" | "distribuido";
export type ColunaCronograma = { chave: string; ano: number; mes: number; total: number; count: number };

/**
 * O CRONOGRAMA dos itens com MÊS DEFINIDO em 3 leituras: `mensal` (só eles — os genéricos têm o quadro próprio; a MESMA
 * conta do servidor), `acumulado` (a soma corrida do mensal) e `distribuido` (o fluxo do ano: os genéricos entram com
 * 1/12 do valor em cada mês do ano do PCA).
 */
export function cronogramaDash(itens: ItemAgregavel[], modo: ModoCronograma): ColunaCronograma[] {
  const m = new Map<string, ColunaCronograma>();
  const soma = (ano: number, mes: number, v: number, c: number) => {
    const k = `${ano}-${mes}`;
    const p = m.get(k) ?? { chave: k, ano, mes, total: 0, count: 0 };
    p.total += v;
    p.count += c;
    m.set(k, p);
  };
  for (const i of itens) {
    if (i.ano == null) continue;
    const v = Number(i.valorTotal ?? 0);
    if (i.anual) {
      if (modo === "distribuido") for (let mes = 1; mes <= 12; mes++) soma(i.ano, mes, v / 12, 1 / 12);
    } else if (i.mes != null) soma(i.ano, i.mes, v, 1);
  }
  const lista = [...m.values()].map((p) => ({ ...p, count: Math.round(p.count) })).sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  if (modo !== "acumulado") return lista;
  let corrido = 0;
  let itensCorridos = 0;
  return lista.map((p) => {
    corrido += p.total;
    itensCorridos += p.count;
    return { ...p, total: corrido, count: itensCorridos };
  });
}

/** As colunas ("AAAA-M") que um recorte de mês marca no cronograma. */
export const mesesDoRecorte = (r: RecorteDash | undefined): string[] =>
  r?.dim === "mes" ? [{ ano: r.ano, mes: r.mes }, ...(r.extras ?? [])].map((a) => `${a.ano}-${a.mes}`) : [];

// ---------------------------------------------------------------------------
// FILTROS DO TOPO (menus suspensos): as opções de cada dimensão vêm dos itens que passam nos DEMAIS filtros (facetas
// conectadas, com a contagem) e a escolha de VÁRIOS valores vira UM recorte da dimensão.
// ---------------------------------------------------------------------------

export type DimTopo = "classificacao" | "mes" | "previsao" | "prioridade" | "unidade" | "unidadeMedida";
export type OpcaoDash = { chave: string; count: number };

/** A chave do mês de um item no filtro do topo: "AAAA-M"; o genérico e o sem data = null (filtram-se pela Previsão). */
const chaveMesTopo = (i: ItemRecortavel): string | null => (i.ano == null || i.anual || i.mes == null ? null : `${i.ano}-${i.mes}`);

/** As opções da dimensão (com a contagem de itens) nos itens que passam nos OUTROS filtros. Mês em ordem do calendário,
 * a Previsão na ordem fixa (`PREVISOES_DASH`); as demais da maior contagem para a menor, "—" por último. */
export function opcoesDash(itens: ItemRecortavel[], filtros: FiltrosDash, dim: DimTopo): OpcaoDash[] {
  const conta = new Map<string, number>();
  for (const i of filtrarItensDash(itens, filtros, dim)) {
    const c = dim === "mes" ? chaveMesTopo(i) : chave(CAMPO[dim](i));
    if (c != null) conta.set(c, (conta.get(c) ?? 0) + 1);
  }
  // As escolhidas continuam na lista (mesmo zeradas pelos outros filtros) — dá para desmarcar.
  for (const c of chavesDoFiltro(filtros, dim)) if (!conta.has(c)) conta.set(c, 0);
  const lista = [...conta].map(([c, n]) => ({ chave: c, count: n }));
  if (dim === "mes") {
    const ord = (c: string) => {
      const [a, m] = c.split("-").map(Number);
      return a * 100 + m;
    };
    return lista.sort((a, b) => ord(a.chave) - ord(b.chave));
  }
  if (dim === "previsao") return lista.sort((a, b) => ordemPrevisao(a.chave) - ordemPrevisao(b.chave));
  // "—" (sem valor) sempre no fim.
  return lista.sort((a, b) => Number(a.chave === "—") - Number(b.chave === "—") || b.count - a.count || a.chave.localeCompare(b.chave, "pt-BR"));
}

/** As chaves escolhidas de uma dimensão (o que os menus mostram marcado). */
export function chavesDoFiltro(filtros: FiltrosDash, dim: DimTopo): string[] {
  const r = filtros[dim]?.recorte;
  if (!r) return [];
  if (r.dim === "mes") return mesesDoRecorte(r);
  return r.dim === dim && "labels" in r ? r.labels : [];
}

/** As chaves escolhidas → o recorte (nenhuma = sem filtro). Mês: os itens com aquele mês definido. */
export function recorteDasChaves(dim: DimTopo, chaves: string[]): RecorteDash | null {
  if (!chaves.length) return null;
  if (dim !== "mes") return { dim, labels: [...chaves] };
  const [p, ...resto] = chaves.map((c) => {
    const [ano, mes] = c.split("-").map(Number);
    return { ano, mes };
  });
  return { dim: "mes", ano: p.ano, mes: p.mes, ...(resto.length ? { extras: resto } : {}) };
}

/** O texto do chip de vários valores: "A", "A e B", "A, B e mais N". */
export function rotuloVarios(rotulos: string[]): string {
  if (rotulos.length <= 1) return rotulos[0] ?? "";
  if (rotulos.length === 2) return `${rotulos[0]} e ${rotulos[1]}`;
  return `${rotulos[0]}, ${rotulos[1]} e mais ${rotulos.length - 2}`;
}
