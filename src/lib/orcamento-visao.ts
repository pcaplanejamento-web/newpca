import { norm } from "./parse-dfd-comum.ts";

/**
 * VISÕES SALVAS do orçamento — núcleo PURO (sem `getDb`/JSX → testável). Uma visão = nome +, por
 * DIMENSÃO do CUBO, a lista de valores selecionados (vazia/ausente = "Todos"). Dentro da dimensão
 * vale QUALQUER valor marcado (OU); entre dimensões, TODAS têm de valer (E). As opções de cada
 * dimensão são CONECTADAS (facetas): vêm das linhas que passam nas DEMAIS dimensões.
 *
 * As dimensões são as colunas de texto que o CUBO importado traz hoje. Uma coluna nova do CUBO
 * entra acrescentando uma entrada em `DIMENSOES_ORCAMENTO` (a UI e o filtro seguem o catálogo).
 */

export type DimensaoOrcamento =
  | "orgao"
  | "unidade"
  | "funcao"
  | "programa"
  | "acao"
  | "nomeElemento"
  | "codigoElemento"
  | "ficha"
  | "fonte";

export const DIMENSOES_ORCAMENTO: { key: DimensaoOrcamento; rotulo: string; rotuloCurto: string }[] = [
  { key: "orgao", rotulo: "Órgão", rotuloCurto: "órgão" },
  { key: "unidade", rotulo: "Unidade", rotuloCurto: "unidade" },
  { key: "funcao", rotulo: "Função", rotuloCurto: "função" },
  { key: "programa", rotulo: "Programa", rotuloCurto: "programa" },
  { key: "acao", rotulo: "Ação", rotuloCurto: "ação" },
  { key: "nomeElemento", rotulo: "Elemento de despesa", rotuloCurto: "elemento de despesa" },
  { key: "codigoElemento", rotulo: "Código do elemento", rotuloCurto: "código" },
  { key: "ficha", rotulo: "Ficha", rotuloCurto: "ficha" },
  { key: "fonte", rotulo: "Fonte de recurso", rotuloCurto: "fonte" },
];

/** `{dimensão: valores[]}` — só as dimensões com seleção. */
export type FiltrosVisao = Partial<Record<DimensaoOrcamento, string[]>>;

export type VisaoOrcamento = { id: number; nome: string; filtros: FiltrosVisao; ordem: number };

/** Linha mínima do orçamento que a visão filtra. */
export type LinhaOrcamentoVisao = Partial<Record<DimensaoOrcamento, string | null>>;

const CHAVES = new Set<string>(DIMENSOES_ORCAMENTO.map((d) => d.key));

/** Valor exibível de uma dimensão (vazio → "—"). */
export function valorDimensao(l: LinhaOrcamentoVisao, d: DimensaoOrcamento): string {
  const v = String(l[d] ?? "").trim();
  return v || "—";
}

/** Normaliza qualquer JSON em `FiltrosVisao` (chaves desconhecidas/valores inválidos fora; sem duplicar). */
export function coerceFiltros(v: unknown): FiltrosVisao {
  let o: unknown = v;
  if (typeof v === "string") {
    try {
      o = JSON.parse(v);
    } catch {
      return {};
    }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return {};
  const out: FiltrosVisao = {};
  for (const [k, lista] of Object.entries(o as Record<string, unknown>)) {
    if (!CHAVES.has(k) || !Array.isArray(lista)) continue;
    const vals = [...new Set(lista.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()))];
    if (vals.length) out[k as DimensaoOrcamento] = vals;
  }
  return out;
}

type Conjuntos = Map<DimensaoOrcamento, Set<string>>;

function conjuntos(f: FiltrosVisao): Conjuntos {
  const m: Conjuntos = new Map();
  for (const d of DIMENSOES_ORCAMENTO) {
    const vals = f[d.key];
    if (vals?.length) m.set(d.key, new Set(vals.map(norm)));
  }
  return m;
}

function passa(l: LinhaOrcamentoVisao, c: Conjuntos, ignorar?: DimensaoOrcamento): boolean {
  for (const [d, set] of c) {
    if (d === ignorar) continue;
    if (!set.has(norm(valorDimensao(l, d)))) return false;
  }
  return true;
}

/** As linhas que passam na visão (sem filtros = todas). */
export function aplicarVisao<T extends LinhaOrcamentoVisao>(linhas: T[], filtros: FiltrosVisao | null | undefined): T[] {
  const c = conjuntos(filtros ?? {});
  if (c.size === 0) return linhas;
  return linhas.filter((l) => passa(l, c));
}

export type OpcaoDimensao = { valor: string; linhas: number };

/** Opções da dimensão CONECTADAS: os valores das linhas que passam nas DEMAIS dimensões (ordem alfabética). */
export function opcoesDaDimensao(linhas: LinhaOrcamentoVisao[], d: DimensaoOrcamento, filtros: FiltrosVisao): OpcaoDimensao[] {
  const c = conjuntos(filtros);
  const cont = new Map<string, OpcaoDimensao>();
  for (const l of linhas) {
    if (!passa(l, c, d)) continue;
    const v = valorDimensao(l, d);
    const k = norm(v);
    const o = cont.get(k) ?? { valor: v, linhas: 0 };
    o.linhas += 1;
    cont.set(k, o);
  }
  return [...cont.values()].sort((a, b) => a.valor.localeCompare(b.valor, "pt-BR", { numeric: true }));
}

/** "15 elemento de despesa · 248 unidade" — ou "Todos os lançamentos" sem filtro. */
export function resumoVisao(filtros: FiltrosVisao | null | undefined): string {
  const partes = DIMENSOES_ORCAMENTO.flatMap((d) => {
    const n = filtros?.[d.key]?.length ?? 0;
    return n > 0 ? [`${n} ${d.rotuloCurto}`] : [];
  });
  return partes.length ? partes.join(" · ") : "Todos os lançamentos";
}
