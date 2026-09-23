/**
 * Filtros das TABELAS (`DataTable`) — núcleo PURO/testável. Três tipos por coluna:
 * - `values`: multi-seleção de valores; a coluna pode ter VÁRIOS valores por linha (ex.: Estado = todos
 *   os problemas do DFD, inclusive os ocultos no "+N") — a linha passa se QUALQUER um estiver marcado;
 * - `date`: intervalo DE/ATÉ (ISO);
 * - `range`: faixa numérica MÍN/MÁX (colunas de valores R$).
 * Os filtros são CONECTADOS (facetados): as opções/faixa/anos de cada coluna vêm das linhas que passam
 * nos DEMAIS filtros — filtrar uma coluna restringe o que as outras oferecem.
 */

export type TipoFiltro = "values" | "date" | "range" | "none";
export type IntervaloData = { de?: string; ate?: string };
export type FaixaValor = { min?: number; max?: number };
export type FiltroValor = string[] | IntervaloData | FaixaValor;

/** Valores de UMA coluna já extraídos para todas as linhas (acesso O(1) no laço de filtro). */
export type ColunaDados =
  | { tipo: "values"; vals: string[][]; ordem?: string[] }
  | { tipo: "date"; vals: string[] }
  | { tipo: "range"; vals: (number | null)[] }
  | { tipo: "none" };

/** Meio centavo: compara valores monetários sem tropeçar em ponto flutuante. */
const EPS = 0.005;

/** O filtro da coluna está ATIVO (restringe algo)? */
export function filtroAtivo(tipo: TipoFiltro, f: FiltroValor | undefined): boolean {
  if (!f) return false;
  if (tipo === "values") return Array.isArray(f) && f.length > 0;
  if (tipo === "date") return !Array.isArray(f) && !!((f as IntervaloData).de || (f as IntervaloData).ate);
  if (tipo === "range") return !Array.isArray(f) && ((f as FaixaValor).min != null || (f as FaixaValor).max != null);
  return false;
}

/** A linha `i` passa no filtro (já ATIVO) da coluna? */
function passa(c: ColunaDados, f: FiltroValor, sel: Set<string> | null, i: number): boolean {
  if (c.tipo === "values") {
    const vs = c.vals[i];
    for (const v of vs) if (sel?.has(v)) return true;
    return false;
  }
  if (c.tipo === "date") {
    const v = c.vals[i];
    const { de, ate } = f as IntervaloData;
    if (de && v < de) return false;
    if (ate && v > ate) return false;
    return true;
  }
  if (c.tipo === "range") {
    const n = c.vals[i];
    if (n == null || Number.isNaN(n)) return false;
    const { min, max } = f as FaixaValor;
    if (min != null && n < min - EPS) return false;
    if (max != null && n > max + EPS) return false;
    return true;
  }
  return true;
}

export type ResultadoFiltros = {
  /** Índices (na ordem original) das linhas que passam em TODOS os filtros. */
  passam: number[];
  /** Por coluna `values`: opções FACETADAS (as linhas que passam nos demais filtros), ordenadas. */
  opcoes: (string[] | null)[];
  /** Por coluna `range`: valores DISTINTOS e ordenados da faceta (domínio da barra de faixa). */
  dominios: (number[] | null)[];
  /** Por coluna `date`: anos presentes na faceta (mais recente primeiro). */
  anos: (number[] | null)[];
};

const cmpTexto = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true });

/**
 * Aplica os filtros e calcula as FACETAS de cada coluna numa única passada: uma linha que falha em
 * nenhum filtro alimenta todas as colunas; a que falha em exatamente UM alimenta só a coluna desse
 * filtro (é o que ela ofereceria se ele fosse retirado); a que falha em 2+ não alimenta nenhuma.
 * O(linhas × colunas).
 */
export function aplicarFiltros(total: number, cols: ColunaDados[], filtros: (FiltroValor | undefined)[]): ResultadoFiltros {
  const ativos: number[] = [];
  const sels: (Set<string> | null)[] = cols.map(() => null);
  cols.forEach((c, j) => {
    if (c.tipo === "none" || !filtroAtivo(c.tipo, filtros[j])) return;
    ativos.push(j);
    if (c.tipo === "values") sels[j] = new Set(filtros[j] as string[]);
  });
  const facetaVals: (Set<string> | null)[] = cols.map((c) => (c.tipo === "values" ? new Set<string>() : null));
  const facetaNum: (Set<number> | null)[] = cols.map((c) => (c.tipo === "range" ? new Set<number>() : null));
  const facetaAno: (Set<number> | null)[] = cols.map((c) => (c.tipo === "date" ? new Set<number>() : null));
  const passam: number[] = [];

  for (let i = 0; i < total; i++) {
    let falhas = 0;
    let unica = -1;
    for (const j of ativos) {
      if (!passa(cols[j], filtros[j] as FiltroValor, sels[j], i)) {
        falhas++;
        unica = j;
        if (falhas > 1) break;
      }
    }
    if (falhas > 1) continue;
    if (falhas === 0) passam.push(i);
    for (let j = 0; j < cols.length; j++) {
      if (falhas === 1 && unica !== j) continue;
      const c = cols[j];
      if (c.tipo === "values") {
        const fs = facetaVals[j] as Set<string>;
        for (const v of c.vals[i]) if (v) fs.add(v);
      } else if (c.tipo === "range") {
        const n = c.vals[i];
        if (n != null && !Number.isNaN(n)) (facetaNum[j] as Set<number>).add(n);
      } else if (c.tipo === "date") {
        const a = c.vals[i]?.slice(0, 4);
        if (a && /^\d{4}$/.test(a)) (facetaAno[j] as Set<number>).add(Number(a));
      }
    }
  }

  const opcoes = cols.map((c, j) => {
    if (c.tipo !== "values") return null;
    const fs = facetaVals[j] as Set<string>;
    // Ordem FIXA (ex.: `filterOptions`) quando dada — só com o que existe na faceta.
    return c.ordem ? c.ordem.filter((o) => fs.has(o)) : [...fs].sort(cmpTexto);
  });
  const dominios = cols.map((c, j) => (c.tipo === "range" ? [...(facetaNum[j] as Set<number>)].sort((a, b) => a - b) : null));
  const anos = cols.map((c, j) => (c.tipo === "date" ? [...(facetaAno[j] as Set<number>)].sort((a, b) => b - a) : null));
  return { passam, opcoes, dominios, anos };
}

/**
 * Normaliza a seleção de um filtro `values` ao aplicar: vazia OU cobrindo TODAS as opções oferecidas
 * ⇒ `null` (= sem filtro); senão a própria seleção (sem repetir).
 */
export function normalizarSelecao(sel: string[], opcoes: string[]): string[] | null {
  const s = [...new Set(sel)];
  if (s.length === 0) return null;
  const set = new Set(s);
  return opcoes.length > 0 && opcoes.every((o) => set.has(o)) ? null : s;
}

/**
 * Normaliza a faixa de um filtro `range` ao aplicar: sem limites, ou cobrindo o domínio INTEIRO
 * ("valor cheio") ⇒ `null` (= sem filtro); inverte mín/máx trocados.
 */
export function normalizarFaixa(f: FaixaValor | null, dominio: number[]): FaixaValor | null {
  if (!f) return null;
  let { min, max } = f;
  if (min != null && Number.isNaN(min)) min = undefined;
  if (max != null && Number.isNaN(max)) max = undefined;
  if (min != null && max != null && min > max) [min, max] = [max, min];
  if (min == null && max == null) return null;
  if (dominio.length > 0) {
    const lo = dominio[0];
    const hi = dominio[dominio.length - 1];
    const cobreMin = min == null || min <= lo + EPS;
    const cobreMax = max == null || max >= hi - EPS;
    if (cobreMin && cobreMax) return null;
  }
  return { ...(min != null ? { min } : {}), ...(max != null ? { max } : {}) };
}

/** Índice da barra (domínio ordenado) para um limite: `min` → 1º ≥ min; `max` → último ≤ max. */
export function indiceNoDominio(dominio: number[], v: number | undefined, lado: "min" | "max"): number {
  const n = dominio.length;
  if (n === 0) return 0;
  if (v == null) return lado === "min" ? 0 : n - 1;
  if (lado === "min") {
    const i = dominio.findIndex((x) => x >= v - EPS);
    return i < 0 ? n - 1 : i;
  }
  for (let i = n - 1; i >= 0; i--) if (dominio[i] <= v + EPS) return i;
  return 0;
}

/** Valor vazio para ordenação (nulo, "" ou NaN) — vai SEMPRE para o fim, nos dois sentidos. */
const vazio = (v: string | number | null | undefined) => v == null || v === "" || (typeof v === "number" && Number.isNaN(v));

/**
 * Ordena ÍNDICES de linha pela chave já extraída (`chaves[i]`, calculada UMA vez por linha): numérico
 * quando os dois lados são números, senão texto natural pt-BR; vazios por último. Estável.
 */
export function ordenarIndices(indices: number[], chaves: (string | number | null | undefined)[], dir: "asc" | "desc"): number[] {
  const sinal = dir === "asc" ? 1 : -1;
  return [...indices].sort((ia, ib) => {
    const a = chaves[ia];
    const b = chaves[ib];
    const ea = vazio(a);
    const eb = vazio(b);
    if (ea || eb) return ea === eb ? ia - ib : ea ? 1 : -1;
    const na = typeof a === "number" ? a : Number(a);
    const nb = typeof b === "number" ? b : Number(b);
    const c = !Number.isNaN(na) && !Number.isNaN(nb) ? na - nb : cmpTexto(String(a), String(b));
    return c !== 0 ? c * sinal : ia - ib;
  });
}
