/**
 * LAYOUT DE COLUNAS editável de uma tabela — núcleo PURO (testável), compartilhado pela tabela cruzada do Comparativo e
 * pela `DataTable` (Mesa): a ordem (congeladas + livres), as ocultas e as larguras. Na `DataTable` o layout salvo leva
 * também a ORDENAÇÃO e os FILTROS das colunas (`LayoutTabela`).
 */
import type { FiltroValor } from "./tabela-filtros";

export const LARGURA_MIN = 56;
export const LARGURA_MAX = 640;

/** A largura (px) dentro do intervalo permitido. */
export const larguraValida = (px: number) => Math.round(Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, px)));

/**
 * A ORDEM EXIBIDA das colunas: as congeladas (na ordem delas) e as livres (pela ordem manual; as que não estão nela, na
 * ordem PADRÃO). Só as chaves presentes em `padrao` entram.
 */
export function ordemDasColunas(padrao: string[], fixadas: string[], manual: string[]): { fixadas: string[]; livres: string[] } {
  const presentes = new Set(padrao);
  const fix = fixadas.filter((k) => presentes.has(k));
  const congeladas = new Set(fix);
  const pos = new Map(manual.map((k, i) => [k, i]));
  const idx = new Map(padrao.map((k, i) => [k, i]));
  const naLista = (k: string) => pos.get(k) ?? Number.POSITIVE_INFINITY;
  const livres = padrao
    .filter((k) => !congeladas.has(k))
    .sort((a, b) => naLista(a) - naLista(b) || (idx.get(a) ?? 0) - (idx.get(b) ?? 0));
  return { fixadas: fix, livres };
}

/**
 * SOLTA a coluna ARRASTADA na posição `destino` da ordem exibida (congeladas + livres, SEM a arrastada). Soltar entre as
 * congeladas a CONGELA; depois delas, a SOLTA; exatamente na divisa, mantém o que era. Devolve as duas listas novas.
 */
export function soltarColuna(fixadas: string[], livres: string[], chave: string, destino: number): { fixadas: string[]; livres: string[] } {
  const eraFixa = fixadas.includes(chave);
  const f = fixadas.filter((k) => k !== chave);
  const todas = [...f, ...livres.filter((k) => k !== chave)];
  const t = Math.max(0, Math.min(destino, todas.length));
  todas.splice(t, 0, chave);
  const k = t < f.length || (t === f.length && eraFixa) ? f.length + 1 : f.length;
  return { fixadas: todas.slice(0, k), livres: todas.slice(k) };
}

/** Lista de chaves de coluna válida (texto curto, sem repetição, com teto). */
export const listaChaves = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 300))].slice(0, 500) : [];

/** Larguras válidas (no intervalo e em ordem de chave — dois layouts iguais têm o MESMO JSON). */
export function coerceLarguras(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, w] of Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).slice(0, 500)) {
    if (k.length && k.length <= 300 && typeof w === "number" && Number.isFinite(w)) out[k] = larguraValida(w);
  }
  return out;
}

/** Os AJUSTES editáveis das colunas (comuns aos dois tipos de tabela). */
export type AjustesColunas = { larguras: Record<string, number>; fixadas: string[]; ocultas: string[]; ordemManual: string[] };

/** Larguras: `null` volta ao padrão. */
export function comLargura<L extends AjustesColunas>(l: L, chave: string, px: number | null): L {
  const larguras = { ...l.larguras };
  if (px == null) delete larguras[chave];
  else larguras[chave] = larguraValida(px);
  return { ...l, larguras };
}

/** Oculta/mostra UMA coluna. */
export const alternarOculta = <L extends AjustesColunas>(l: L, chave: string): L => ({
  ...l,
  ocultas: l.ocultas.includes(chave) ? l.ocultas.filter((x) => x !== chave) : [...l.ocultas, chave],
});

/** A ORDEM nova (arrastar/congelar) das colunas PRESENTES — as de fora (ex.: de outro contexto) mantêm o que tinham. */
export function comOrdem<L extends AjustesColunas>(l: L, presentes: string[], fixadas: string[], livres: string[]): L {
  const aqui = new Set(presentes);
  return {
    ...l,
    fixadas: [...fixadas, ...l.fixadas.filter((x) => !aqui.has(x))],
    ordemManual: [...livres, ...l.ordemManual.filter((x) => !aqui.has(x))],
  };
}

/** Ordenação salva da `DataTable`. */
export type OrdemTabela = { key: string; dir: "asc" | "desc" } | null;

/** O layout SALVO de uma `DataTable` (as edições da Mesa): colunas + ordenação + FILTROS das colunas. */
export type LayoutTabela = AjustesColunas & { v: 1; ordem: OrdemTabela; filtros: Record<string, FiltroValor> };

export const LAYOUT_TABELA_PADRAO: LayoutTabela = { v: 1, larguras: {}, fixadas: [], ocultas: [], ordemManual: [], ordem: null, filtros: {} };

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
const txt = (x: unknown) => (typeof x === "string" && x.length <= 40 ? x : undefined);

/** Um filtro salvo VÁLIDO (seleção de valores, faixa numérica ou intervalo de datas) — ou `null`. */
function coerceFiltro(v: unknown): FiltroValor | null {
  if (Array.isArray(v)) {
    const vals = v.filter((x): x is string => typeof x === "string" && x.length <= 500).slice(0, 2000);
    return vals.length ? vals : null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if ("min" in o || "max" in o) {
    const f = { min: num(o.min), max: num(o.max) };
    return f.min == null && f.max == null ? null : f;
  }
  const d = { de: txt(o.de), ate: txt(o.ate) };
  return d.de || d.ate ? d : null;
}

/** Qualquer JSON → layout de `DataTable` VÁLIDO e canônico (o salvo nunca quebra a tabela; chaves de colunas que não
 * existem mais são ignoradas por quem usa). */
export function coerceLayoutTabela(v: unknown): LayoutTabela {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const s = o.ordem as { key?: unknown; dir?: unknown } | null | undefined;
  const filtros: Record<string, FiltroValor> = {};
  if (o.filtros && typeof o.filtros === "object" && !Array.isArray(o.filtros)) {
    for (const [k, f] of Object.entries(o.filtros as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).slice(0, 200)) {
      const c = coerceFiltro(f);
      if (k.length && k.length <= 300 && c) filtros[k] = c;
    }
  }
  return {
    v: 1,
    larguras: coerceLarguras(o.larguras),
    fixadas: listaChaves(o.fixadas),
    ocultas: listaChaves(o.ocultas),
    ordemManual: listaChaves(o.ordemManual),
    ordem: s && typeof s.key === "string" && s.key.length <= 300 ? { key: s.key, dir: s.dir === "desc" ? "desc" : "asc" } : null,
    filtros,
  };
}

export const layoutTabelaIgual = (a: LayoutTabela, b: LayoutTabela) => JSON.stringify(coerceLayoutTabela(a)) === JSON.stringify(coerceLayoutTabela(b));
