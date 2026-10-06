/**
 * ORIGEM DOS DADOS dos gráficos do Dashboard — núcleo PURO (testado). Um clique numa fatia/barra vira um
 * RECORTE, e `itensDoRecorte` devolve os itens que formam aquele número com a MESMA chave de agrupamento
 * dos gráficos (`fatias` do `pca-core` e as consultas de `queries.ts`: valor vazio = "—").
 */

import { agregarDashboard, type ItemDashboard } from "./pca-core.ts";

export type RecorteDash =
  | { dim: "classificacao"; labels: string[] }
  | { dim: "unidadeMedida"; labels: string[] }
  | { dim: "mes"; ano: number; mes: number }
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
};

const chave = (v: string | null) => v || "—";

/** Itens do recorte + quantos entram por serem ANUAIS (no recorte de mês — 1/12 do valor em cada mês). */
export function itensDoRecorte<T extends ItemRecortavel>(itens: T[], r: RecorteDash): { itens: T[]; anuais: number } {
  if (r.dim === "item") return { itens: itens.filter((i) => i.id === r.id), anuais: 0 };
  if (r.dim === "mes") {
    let anuais = 0;
    const lista = itens.filter((i) => {
      if (i.ano !== r.ano) return false;
      if (i.anual) {
        anuais++;
        return true;
      }
      return i.mes === r.mes;
    });
    return { itens: lista, anuais };
  }
  const set = new Set(r.labels);
  const campo = r.dim === "classificacao" ? (i: T) => i.classificacao : (i: T) => i.unidadeMedida;
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
  r.dim === "item" ? `i:${r.id}` : r.dim === "mes" ? `m:${r.ano}-${r.mes}` : `${r.dim}:${[...r.labels].sort().join("|")}`;

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
