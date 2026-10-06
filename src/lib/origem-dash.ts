/**
 * ORIGEM DOS DADOS dos gráficos do Dashboard — núcleo PURO (testado). Um clique numa fatia/barra vira um
 * RECORTE, e `itensDoRecorte` devolve os itens que formam aquele número com a MESMA chave de agrupamento
 * dos gráficos (`fatias` do `pca-core` e as consultas de `queries.ts`: valor vazio = "—").
 */

import { agregarDashboard, type ItemDashboard } from "./pca-core.ts";

export type RecorteDash =
  | { dim: "classificacao"; labels: string[] }
  | { dim: "unidadeMedida"; labels: string[] }
  | { dim: "prioridade"; labels: string[] }
  | { dim: "unidade"; labels: string[] }
  /** `mes: 0` = os itens ANUAIS do ano; `semAnuais` = só os do mês (o cronograma com os anuais à parte). */
  | { dim: "mes"; ano: number; mes: number; semAnuais?: boolean; extras?: { ano: number; mes: number }[] }
  | { dim: "item"; id: number };

/** O mínimo de um item p/ o recorte (o `ItemRow` do dashboard). */
export type ItemRecortavel = {
  id: number;
  classificacao: string | null;
  unidadeMedida: string | null;
  ano?: number | null;
  mes?: number | null;
  /** Previsão ANUAL (fonte protocolo): o cronograma soma 1/12 do item em CADA mês do ano. */
  anual?: boolean;
  /** Prioridade do DFD de origem (ALTA/MÉDIA/BAIXA; fonte protocolo). */
  prioridade?: string | null;
  /** Sigla da unidade (requisitante ou planilha). */
  codigo?: string | null;
};

const chave = (v: string | null | undefined) => v || "—";

/** O campo de cada dimensão por rótulo (a MESMA chave dos gráficos: vazio = "—"). */
const CAMPO = {
  classificacao: (i: ItemRecortavel) => i.classificacao,
  unidadeMedida: (i: ItemRecortavel) => i.unidadeMedida,
  prioridade: (i: ItemRecortavel) => i.prioridade,
  unidade: (i: ItemRecortavel) => i.codigo,
};

/** Itens do recorte + quantos entram por serem ANUAIS (no recorte de mês — 1/12 do valor em cada mês). */
export function itensDoRecorte<T extends ItemRecortavel>(itens: T[], r: RecorteDash): { itens: T[]; anuais: number } {
  if (r.dim === "item") return { itens: itens.filter((i) => i.id === r.id), anuais: 0 };
  if (r.dim === "mes") {
    // Vários meses (o filtro do topo): o item entra se casa QUALQUER um.
    const alvos = [{ ano: r.ano, mes: r.mes }, ...(r.extras ?? [])];
    let anuais = 0;
    const lista = itens.filter((i) => {
      const casa = alvos.some((a) => {
        if (i.ano !== a.ano) return false;
        if (a.mes === 0) return !!i.anual;
        if (i.anual) return !r.semAnuais;
        return i.mes === a.mes;
      });
      if (casa && i.anual) anuais++;
      return casa;
    });
    return { itens: lista, anuais };
  }
  const set = new Set(r.labels);
  const campo = CAMPO[r.dim] as (i: T) => string | null | undefined;
  return { itens: itens.filter((i) => set.has(chave(campo(i)))), anuais: 0 };
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
  r.dim === "item" ? `i:${r.id}` : r.dim === "mes" ? `m:${[{ ano: r.ano, mes: r.mes }, ...(r.extras ?? [])].map((a) => `${a.ano}-${a.mes}`).sort().join("|")}${r.semAnuais ? ":s" : ""}` : `${r.dim}:${[...r.labels].sort().join("|")}`;

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
    previsao: i.ano == null ? null : i.anual ? { ano: i.ano, anual: true } : i.mes != null ? { ano: i.ano, mes: i.mes } : null,
    unidade: i.codigo,
    origem: null,
  };
}

/** KPIs + fatias + cronograma + top a partir da lista de itens (no navegador, para o filtro cruzado). */
export function agregarItensDash(itens: ItemAgregavel[]) {
  return agregarDashboard(itens.map(paraDashboard));
}

/** Fatias por um campo (rótulo vazio = "—"), pelo valor. */
export function fatiasDash(itens: ItemAgregavel[], dim: "prioridade" | "unidade") {
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

export type ModoCronograma = "mensal" | "acumulado" | "separado";
export type ColunaCronograma = { chave: string; ano: number; mes: number; total: number; count: number; semAnuais?: boolean };

/**
 * O CRONOGRAMA em 3 leituras: `mensal` (o anual entra com 1/12 em cada mês — o padrão, a MESMA conta do servidor),
 * `acumulado` (a soma corrida do mensal) e `separado` (os meses SEM os anuais + uma coluna "Anual" por ano, `mes: 0`).
 */
export function cronogramaDash(itens: ItemAgregavel[], modo: ModoCronograma): ColunaCronograma[] {
  const m = new Map<string, ColunaCronograma>();
  const soma = (ano: number, mes: number, v: number, c: number, semAnuais?: boolean) => {
    const k = `${ano}-${mes}`;
    const p = m.get(k) ?? { chave: k, ano, mes, total: 0, count: 0, semAnuais };
    p.total += v;
    p.count += c;
    m.set(k, p);
  };
  for (const i of itens) {
    if (i.ano == null) continue;
    const v = Number(i.valorTotal ?? 0);
    if (i.anual) {
      if (modo === "separado") soma(i.ano, 0, v, 1);
      else for (let mes = 1; mes <= 12; mes++) soma(i.ano, mes, v / 12, 1 / 12);
    } else if (i.mes != null) soma(i.ano, i.mes, v, 1, modo === "separado" || undefined);
  }
  // "Anual" depois dos meses do ano.
  const lista = [...m.values()]
    .map((p) => ({ ...p, count: Math.round(p.count) }))
    .sort((a, b) => a.ano - b.ano || (a.mes || 13) - (b.mes || 13));
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

export type DimTopo = "classificacao" | "mes" | "prioridade" | "unidade" | "unidadeMedida";
export type OpcaoDash = { chave: string; count: number };

/** A chave do mês de um item no filtro do topo: "AAAA-M"; o ANUAL = "AAAA-0" (opção própria); sem data = null. */
const chaveMesTopo = (i: ItemRecortavel): string | null =>
  i.ano == null ? null : i.anual ? `${i.ano}-0` : i.mes != null ? `${i.ano}-${i.mes}` : null;

/** As opções da dimensão (com a contagem de itens) nos itens que passam nos OUTROS filtros. Mês em ordem do calendário
 * (os anuais depois dos meses do ano); as demais da maior contagem para a menor, "—" por último. */
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
      return a * 100 + (m === 0 ? 13 : m);
    };
    return lista.sort((a, b) => ord(a.chave) - ord(b.chave));
  }
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

/** As chaves escolhidas → o recorte (nenhuma = sem filtro). Mês: cada mês SEM os anuais (eles são a opção "AAAA-0"). */
export function recorteDasChaves(dim: DimTopo, chaves: string[]): RecorteDash | null {
  if (!chaves.length) return null;
  if (dim !== "mes") return { dim, labels: [...chaves] };
  const [p, ...resto] = chaves.map((c) => {
    const [ano, mes] = c.split("-").map(Number);
    return { ano, mes };
  });
  return { dim: "mes", ano: p.ano, mes: p.mes, semAnuais: true, ...(resto.length ? { extras: resto } : {}) };
}

/** O texto do chip de vários valores: "A", "A e B", "A, B e mais N". */
export function rotuloVarios(rotulos: string[]): string {
  if (rotulos.length <= 1) return rotulos[0] ?? "";
  if (rotulos.length === 2) return `${rotulos[0]} e ${rotulos[1]}`;
  return `${rotulos[0]}, ${rotulos[1]} e mais ${rotulos.length - 2}`;
}
