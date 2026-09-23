/**
 * Filtros das TABELAS (`DataTable`) — núcleo PURO/testável. Três tipos por coluna:
 * - `values`: multi-seleção de valores; a coluna pode ter VÁRIOS valores por linha (ex.: Estado = todos
 *   os problemas do DFD, inclusive os ocultos no "+N") — a linha passa se QUALQUER um estiver marcado;
 * - `date`: intervalo DE/ATÉ (ISO);
 * - `range`: faixa numérica MÍN/MÁX (colunas de valores R$).
 * Os filtros são CONECTADOS (facetados): as opções/faixa/anos de cada coluna vêm das linhas que passam
 * nos DEMAIS filtros — filtrar uma coluna restringe o que as outras oferecem.
 */

import { stripAccents } from "./normalize.ts";

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

/** Texto pt-BR "natural" (números em ordem numérica) — UM `Intl.Collator` reutilizado: `localeCompare`
 * com opções cria um collator por chamada (dezenas de vezes mais lento em listas grandes). */
const COLLATOR = new Intl.Collator("pt-BR", { numeric: true });
const cmpTexto = COLLATOR.compare;

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

/** Chave de BUSCA: sem acento e sem caixa, espaços colapsados — com cache (a busca roda a cada tecla sobre milhares). */
const CACHE_BUSCA = new Map<string, string>();
function chaveBusca(s: string): string {
  let k = CACHE_BUSCA.get(s);
  if (k === undefined) {
    k = stripAccents(s).toLowerCase().replace(/\s+/g, " ").trim();
    if (CACHE_BUSCA.size > 20_000) CACHE_BUSCA.clear();
    CACHE_BUSCA.set(s, k);
  }
  return k;
}

/**
 * Predicado da BUSCA de LINHAS (o campo de busca acima de uma tabela/lista): sem acento/caixa, a linha casa se algum
 * campo CONTÉM o texto — ou, com ":" (vários de uma vez, ex.: "5241947270:5241937263"), QUALQUER um dos termos (o
 * texto inteiro também vale: "10:30"). Busca vazia ⇒ `null` (sem filtro).
 */
export function predicadoBusca(busca: string): ((campos: (string | null | undefined)[]) => boolean) | null {
  const inteiro = chaveBusca(busca);
  if (!inteiro) return null;
  const termos = inteiro.includes(":") ? [inteiro, ...new Set(inteiro.split(":").map((t) => t.trim()).filter(Boolean))] : [inteiro];
  return (campos) =>
    campos.some((c) => {
      const k = chaveBusca(c ?? "");
      return termos.some((t) => k.includes(t));
    });
}

/**
 * Opções que casam a BUSCA de um filtro MÚLTIPLO. Um termo = as que o CONTÊM (sem acento/caixa). VÁRIOS de uma vez
 * com ":" (ex.: "168:170:174" — o mesmo formato do "Copiar planejamentos"): cada termo casa as opções IGUAIS a ele
 * ou, se nenhuma é igual, as que o contêm; o resultado é a união, na ordem das opções. O texto inteiro contido numa
 * opção (ex.: a hora "10:30") vale como um termo só; ":" sobrando (ex.: "168:") é ignorado. Busca vazia = todas.
 */
export function opcoesDaBusca(opcoes: string[], busca: string): string[] {
  const inteiro = chaveBusca(busca);
  if (!inteiro) return opcoes;
  const chaves = opcoes.map(chaveBusca);
  if (!inteiro.includes(":") || chaves.some((c) => c.includes(inteiro))) return opcoes.filter((_, i) => chaves[i].includes(inteiro));
  const exatas = new Map<string, number[]>();
  chaves.forEach((c, i) => {
    const l = exatas.get(c);
    if (l) l.push(i);
    else exatas.set(c, [i]);
  });
  const casa = new Array<boolean>(opcoes.length).fill(false);
  for (const termo of new Set(inteiro.split(":").map((t) => t.trim()))) {
    if (!termo) continue;
    const iguais = exatas.get(termo);
    if (iguais) for (const i of iguais) casa[i] = true;
    else chaves.forEach((c, i) => {
      if (c.includes(termo)) casa[i] = true;
    });
  }
  return opcoes.filter((_, i) => casa[i]);
}

/**
 * Normaliza a faixa de um filtro `range` ao aplicar: CADA lado no extremo do domínio (a alça não mexida)
 * não vira limite — só o lado escolhido restringe (senão o extremo da faceta atual ficaria gravado e
 * esconderia linhas quando os outros filtros saem); sem limite nenhum ("valor cheio") ⇒ `null`.
 * Mín > máx (digitado) fica como está: faixa vazia (a tela mostra "0 valores").
 */
export function normalizarFaixa(f: FaixaValor | null, dominio: number[]): FaixaValor | null {
  if (!f) return null;
  let { min, max } = f;
  if (min != null && Number.isNaN(min)) min = undefined;
  if (max != null && Number.isNaN(max)) max = undefined;
  if (dominio.length > 0) {
    if (min != null && min <= dominio[0] + EPS) min = undefined;
    if (max != null && max >= dominio[dominio.length - 1] - EPS) max = undefined;
  }
  if (min == null && max == null) return null;
  return { ...(min != null ? { min } : {}), ...(max != null ? { max } : {}) };
}

/** Quantos valores do domínio caem na faixa (a contagem do painel = o que o filtro vai mostrar). */
export function contarNaFaixa(dominio: number[], min: number | undefined, max: number | undefined): number {
  let n = 0;
  for (const v of dominio) if ((min == null || v >= min - EPS) && (max == null || v <= max + EPS)) n++;
  return n;
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

/** Valor vazio para ordenação (nulo, "", só espaços, o traço "—" das células sem dado ou NaN) — vai
 * SEMPRE para o fim, nos dois sentidos. */
const vazio = (v: string | number | null | undefined) =>
  v == null || (typeof v === "number" ? Number.isNaN(v) : v.trim() === "" || v.trim() === "—");

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
