import type { Periodo } from "./periodo.ts";

/**
 * FILTROS COM VISÕES — núcleo PURO (testável). O que está filtrado é a DIFERENÇA do estado atual para uma REFERÊNCIA: o
 * ESTADO INICIAL do lugar (definido pelo ADM — por isso nunca aparece como filtro) ou, com uma VISÃO aplicada, a visão.
 * Os valores guardados são ESTÁVEIS (textos e ids — nunca o índice do dicionário de um pacote), então uma visão vale em
 * qualquer ano carregado. `periodo: null` = AUTOMÁTICO (o ano mais recente dos dados): um padrão não envelhece.
 */
export type EstadoFiltros = { periodo: Periodo | null; tipo: string[]; dims: Record<string, string[]> };

export const ESTADO_VAZIO: EstadoFiltros = { periodo: null, tipo: [], dims: {} };

/** O que cada lugar aceita: as dimensões (na ordem dos chips) e os tipos. */
export type RegrasFiltros = { dims: readonly string[]; tipos: readonly string[] };

/** Tetos do que se guarda (a mesma régua no navegador e no servidor). */
export const LIMITES_FILTROS = { valores: 200, texto: 300 } as const;

const PRESETS = new Set(["todo", "hoje", "semana", "mes", "custom"]);
const ehIso = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));

/** Qualquer coisa vira um `Periodo` válido (ou `null` — o automático). */
export function coercePeriodo(v: unknown): Periodo | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  const ano = Number.isInteger(p.ano) && (p.ano as number) >= 2015 && (p.ano as number) <= 2100 ? (p.ano as number) : undefined;
  const mes = ano != null && Number.isInteger(p.mes) && (p.mes as number) >= 1 && (p.mes as number) <= 12 ? (p.mes as number) : undefined;
  const preset = typeof p.preset === "string" && PRESETS.has(p.preset) ? (p.preset as Periodo["preset"]) : undefined;
  if (preset === "custom") {
    const de = ehIso(p.de) ? p.de : undefined;
    const ate = ehIso(p.ate) ? p.ate : undefined;
    if (!de && !ate) return null;
    if (de && ate && de > ate) return { preset, de: ate, ate: de };
    return { preset, ...(de ? { de } : {}), ...(ate ? { ate } : {}) };
  }
  if (preset) return { preset };
  if (ano != null) return mes != null ? { ano, mes } : { ano };
  return null;
}

/** A lista de valores: textos não vazios, sem controle, sem repetir, até o teto. */
function valores(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const x of v) {
    if (typeof x !== "string") continue;
    // biome-ignore lint/suspicious/noControlCharactersInRegex: tirar os caracteres de controle é o objetivo.
    const t = x.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, LIMITES_FILTROS.texto);
    if (t) out.add(t);
    if (out.size >= LIMITES_FILTROS.valores) break;
  }
  return [...out];
}

/** Qualquer JSON vira um estado válido: dimensões e tipos de fora saem, valores saneados e ordenados (forma canônica). */
export function coerceEstado(v: unknown, r: RegrasFiltros): EstadoFiltros {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const tipo = valores(o.tipo).filter((t) => r.tipos.includes(t));
  const brutas = o.dims && typeof o.dims === "object" ? (o.dims as Record<string, unknown>) : {};
  const dims: Record<string, string[]> = {};
  for (const d of r.dims) {
    if (!Object.hasOwn(brutas, d)) continue;
    const l = valores(brutas[d]);
    if (l.length) dims[d] = l.sort();
  }
  return { periodo: coercePeriodo(o.periodo), tipo: tipo.sort(), dims };
}

/** O período em uso (o automático vira o do lugar). */
export const periodoEfetivo = (p: Periodo | null, auto: Periodo): Periodo => p ?? auto;

const chavePeriodo = (p: Periodo): string => JSON.stringify([p.preset ?? null, p.ano ?? null, p.mes ?? null, p.de ?? null, p.ate ?? null]);
export const mesmoPeriodo = (a: Periodo, b: Periodo): boolean => chavePeriodo(a) === chavePeriodo(b);

/** Duas listas de valores iguais como CONJUNTO (a ordem não conta; vazio = "Todos"). */
export const mesmaLista = (a: readonly string[] = [], b: readonly string[] = []): boolean => {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
};

/** O que DIFERE da referência — os chips, na ordem: período, tipo e as dimensões na ordem do lugar. */
export function diferencas(atual: EstadoFiltros, ref: EstadoFiltros, r: RegrasFiltros, auto: Periodo): string[] {
  const out: string[] = [];
  if (!mesmoPeriodo(periodoEfetivo(atual.periodo, auto), periodoEfetivo(ref.periodo, auto))) out.push("periodo");
  if (!mesmaLista(atual.tipo, ref.tipo)) out.push("tipo");
  for (const d of r.dims) if (!mesmaLista(atual.dims[d], ref.dims[d])) out.push(d);
  return out;
}

export const mesmoEstado = (a: EstadoFiltros, b: EstadoFiltros, r: RegrasFiltros, auto: Periodo): boolean => diferencas(a, b, r, auto).length === 0;

/** Excluir o chip de uma parte: ELA volta ao valor da referência (não esvazia — a referência pode tê-la preenchida). */
export function voltarParte(atual: EstadoFiltros, ref: EstadoFiltros, parte: string): EstadoFiltros {
  if (parte === "periodo") return { ...atual, periodo: ref.periodo };
  if (parte === "tipo") return { ...atual, tipo: [...ref.tipo] };
  const dims = { ...atual.dims };
  if (ref.dims[parte]?.length) dims[parte] = [...ref.dims[parte]];
  else delete dims[parte];
  return { ...atual, dims };
}

/** A forma GUARDADA (visão ou estado inicial): canônica e com o período igual ao automático gravado como automático. */
export function paraGuardar(e: EstadoFiltros, r: RegrasFiltros, auto: Periodo): EstadoFiltros {
  const c = coerceEstado(e, r);
  return c.periodo && mesmoPeriodo(c.periodo, auto) ? { ...c, periodo: null } : c;
}

/** Quantas partes da referência têm algo além do automático (o resumo de uma visão ou do estado inicial). */
export function partesDefinidas(e: EstadoFiltros): number {
  return (e.periodo ? 1 : 0) + (e.tipo.length ? 1 : 0) + Object.values(e.dims).filter((l) => l.length > 0).length;
}

/** Os lugares que têm ESTADO INICIAL definido pelo ADM (lista fechada — o servidor recusa as demais chaves). */
export const CHAVES_FILTROS_INICIAIS = ["execucao"] as const;
export type ChaveFiltrosIniciais = (typeof CHAVES_FILTROS_INICIAIS)[number];
export const ehChaveFiltrosIniciais = (x: unknown): x is ChaveFiltrosIniciais =>
  typeof x === "string" && (CHAVES_FILTROS_INICIAIS as readonly string[]).includes(x);

/** O blob guardado (`configuracoes.filtrosIniciais`) lido com segurança: só as chaves conhecidas, cada estado saneado. */
export function lerFiltrosIniciais(v: unknown, regras: Record<ChaveFiltrosIniciais, RegrasFiltros>): Partial<Record<ChaveFiltrosIniciais, EstadoFiltros>> {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out: Partial<Record<ChaveFiltrosIniciais, EstadoFiltros>> = {};
  for (const k of CHAVES_FILTROS_INICIAIS) if (Object.hasOwn(o, k) && o[k]) out[k] = coerceEstado(o[k], regras[k]);
  return out;
}
