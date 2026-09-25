import { dotacaoAtualizada } from "./orcamento-indicadores.ts";
import { DIMENSOES_ORCAMENTO, type DimensaoOrcamento, type LinhaOrcamentoVisao, valorDimensao } from "./orcamento-visao.ts";
import { norm } from "./parse-dfd-comum.ts";

/**
 * COMPARATIVO do orçamento (tabela CRUZADA / dinâmica) — núcleo PURO (testável). Duas colunas do CUBO se LIGAM: os
 * valores de uma viram as LINHAS e os da outra as COLUNAS (ex.: Unidade × Elemento de despesa), e cada célula soma a
 * MEDIDA escolhida (dotação inicial, atualizada, empenho…) dos lançamentos que têm os dois valores. O mesmo agrupamento
 * (a chave `norm` do texto, "—" p/ vazio) serve a tabela, os totais e a ORIGEM de cada número (`lancamentosDoRecorte`)
 * — a soma do detalhe é sempre o número clicado.
 */

export type ValoresOrcamento = {
  valorEmendaImpositiva: number;
  valorInicial: number;
  valorSuplementacao: number;
  valorEmpenho: number;
  saldo: number;
  valorAnulacao: number;
};

export type LinhaCruzamento = LinhaOrcamentoVisao & ValoresOrcamento;

export type MedidaOrcamento = "inicial" | "atualizada" | "suplementacao" | "anulacao" | "empenho" | "saldo" | "emenda";

export const MEDIDAS_ORCAMENTO: { key: MedidaOrcamento; rotulo: string; valor: (l: ValoresOrcamento) => number }[] = [
  { key: "inicial", rotulo: "Dotação inicial", valor: (l) => l.valorInicial || 0 },
  {
    key: "atualizada",
    rotulo: "Dotação atualizada",
    valor: (l) => dotacaoAtualizada({ valorInicial: l.valorInicial, suplementacao: l.valorSuplementacao, anulacao: l.valorAnulacao, empenho: 0 }),
  },
  { key: "suplementacao", rotulo: "Suplementação", valor: (l) => l.valorSuplementacao || 0 },
  { key: "anulacao", rotulo: "Anulação", valor: (l) => l.valorAnulacao || 0 },
  { key: "empenho", rotulo: "Empenho", valor: (l) => l.valorEmpenho || 0 },
  { key: "saldo", rotulo: "Saldo", valor: (l) => l.saldo || 0 },
  { key: "emenda", rotulo: "Emenda impositiva", valor: (l) => l.valorEmendaImpositiva || 0 },
];

export const medidaOrcamento = (m: MedidaOrcamento) => MEDIDAS_ORCAMENTO.find((x) => x.key === m) ?? MEDIDAS_ORCAMENTO[0];

/** Teto de COLUNAS da tabela cruzada (uma dimensão com mais valores só pode ir para as LINHAS). */
export const MAX_COLUNAS_CRUZAMENTO = 120;

const colator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
const chaveDe = (l: LinhaOrcamentoVisao, d: DimensaoOrcamento) => norm(valorDimensao(l, d));
const rotuloDim = (d: DimensaoOrcamento) => DIMENSOES_ORCAMENTO.find((x) => x.key === d)?.rotulo ?? d;

/** Uma dimensão pode ser escolhida? `valores` = quantos valores distintos ela tem; `motivo` quando NÃO pode. */
export type Permissao = { permitida: boolean; motivo: string | null; valores: number };

type Contagem = { valores: Map<string, string>; vazia: boolean };

function contar(linhas: LinhaOrcamentoVisao[], d: DimensaoOrcamento): Contagem {
  const valores = new Map<string, string>();
  for (const l of linhas) {
    const k = chaveDe(l, d);
    if (!valores.has(k)) valores.set(k, valorDimensao(l, d));
  }
  const vazia = valores.size === 0 || (valores.size === 1 && [...valores.values()][0] === "—");
  return { valores, vazia };
}

/** As dimensões que podem ir para as LINHAS: qualquer uma com dados neste orçamento. */
export function permissoesLinhas(linhas: LinhaOrcamentoVisao[]): Record<DimensaoOrcamento, Permissao> {
  const out = {} as Record<DimensaoOrcamento, Permissao>;
  for (const { key } of DIMENSOES_ORCAMENTO) {
    const c = contar(linhas, key);
    out[key] = c.vazia
      ? { permitida: false, motivo: "sem dados neste orçamento", valores: 0 }
      : { permitida: true, motivo: null, valores: c.valores.size };
  }
  return out;
}

/**
 * As dimensões que podem ir para as COLUNAS, LIGADAS à das linhas: não a mesma; com dados; até
 * `MAX_COLUNAS_CRUZAMENTO` valores; e não EQUIVALENTE à das linhas (1 para 1 — ex.: Elemento × Código do elemento:
 * cada linha teria uma única célula, uma diagonal sem nada a comparar).
 */
export function permissoesColunas(linhas: LinhaOrcamentoVisao[], dimLinha: DimensaoOrcamento): Record<DimensaoOrcamento, Permissao> {
  const out = {} as Record<DimensaoOrcamento, Permissao>;
  for (const { key } of DIMENSOES_ORCAMENTO) {
    const c = contar(linhas, key);
    const n = c.valores.size;
    if (key === dimLinha) out[key] = { permitida: false, motivo: "já está nas linhas", valores: n };
    else if (c.vazia) out[key] = { permitida: false, motivo: "sem dados neste orçamento", valores: 0 };
    else if (n > MAX_COLUNAS_CRUZAMENTO) out[key] = { permitida: false, motivo: `${n.toLocaleString("pt-BR")} valores — acima de ${MAX_COLUNAS_CRUZAMENTO} colunas`, valores: n };
    else if (equivalentes(linhas, dimLinha, key)) out[key] = { permitida: false, motivo: `equivale a ${rotuloDim(dimLinha)} (1 para 1)`, valores: n };
    else out[key] = { permitida: true, motivo: null, valores: n };
  }
  return out;
}

/** Cada valor de `a` tem UM só valor de `b` e vice-versa (relação 1 para 1). */
function equivalentes(linhas: LinhaOrcamentoVisao[], a: DimensaoOrcamento, b: DimensaoOrcamento): boolean {
  const ab = new Map<string, string>();
  const ba = new Map<string, string>();
  for (const l of linhas) {
    const x = chaveDe(l, a);
    const y = chaveDe(l, b);
    if ((ab.get(x) ?? y) !== y || (ba.get(y) ?? x) !== x) return false;
    ab.set(x, y);
    ba.set(y, x);
  }
  return ab.size > 1;
}

/** A 1ª dimensão PERMITIDA para as colunas (a preferida, se permitida). */
export function colunaPermitida(perm: Record<DimensaoOrcamento, Permissao>, preferida: DimensaoOrcamento): DimensaoOrcamento | null {
  if (perm[preferida]?.permitida) return preferida;
  return DIMENSOES_ORCAMENTO.find((d) => perm[d.key].permitida)?.key ?? null;
}

export type EixoCruzamento = { chave: string; rotulo: string; total: number; lancamentos: number };
export type LinhaCruzada = EixoCruzamento & { valores: number[] };
export type Cruzamento = { linhas: LinhaCruzada[]; colunas: EixoCruzamento[]; total: number; lancamentos: number };

/** A tabela cruzada: linhas × colunas (ordem natural pt-BR — "2 - …" antes de "10 - …"), a soma da medida por célula e
 * os totais. Linear no nº de lançamentos. */
export function cruzar(itens: LinhaCruzamento[], dimLinha: DimensaoOrcamento, dimColuna: DimensaoOrcamento, medida: MedidaOrcamento): Cruzamento {
  const valor = medidaOrcamento(medida).valor;
  const cols = new Map<string, EixoCruzamento>();
  for (const l of itens) {
    const k = chaveDe(l, dimColuna);
    if (!cols.has(k)) cols.set(k, { chave: k, rotulo: valorDimensao(l, dimColuna), total: 0, lancamentos: 0 });
  }
  const colunas = [...cols.values()].sort((a, b) => colator.compare(a.rotulo, b.rotulo));
  const idx = new Map(colunas.map((c, i) => [c.chave, i]));
  const lins = new Map<string, LinhaCruzada>();
  let total = 0;
  for (const l of itens) {
    const k = chaveDe(l, dimLinha);
    let linha = lins.get(k);
    if (!linha) {
      linha = { chave: k, rotulo: valorDimensao(l, dimLinha), total: 0, lancamentos: 0, valores: new Array(colunas.length).fill(0) };
      lins.set(k, linha);
    }
    const i = idx.get(chaveDe(l, dimColuna)) ?? 0;
    const v = valor(l);
    linha.valores[i] += v;
    linha.total += v;
    linha.lancamentos += 1;
    colunas[i].total += v;
    colunas[i].lancamentos += 1;
    total += v;
  }
  const linhas = [...lins.values()].sort((a, b) => colator.compare(a.rotulo, b.rotulo));
  return { linhas, colunas, total, lancamentos: itens.length };
}

const ZERO = 0.005; // meio centavo
const zerado = (v: number) => Math.abs(v) < ZERO;

/** Tira as linhas e as colunas em que TODAS as células são zero (os totais seguem iguais). */
export function semVazios(c: Cruzamento): Cruzamento {
  const manterCol = c.colunas.map((_, j) => c.linhas.some((l) => !zerado(l.valores[j])));
  const linhas = c.linhas.filter((l) => l.valores.some((v) => !zerado(v))).map((l) => ({ ...l, valores: l.valores.filter((_, j) => manterCol[j]) }));
  return { ...c, linhas, colunas: c.colunas.filter((_, j) => manterCol[j]) };
}

/** Ordem das linhas: pelo rótulo (natural), pela coluna EXTRA (ex.: a sigla), pelo TOTAL ou por uma COLUNA (a chave dela). */
export type OrdemCruzamento = { por: "rotulo" | "extra" | "total" | { coluna: string }; desc: boolean };

export function ordenarLinhas(c: Cruzamento, ordem: OrdemCruzamento, extraDe?: (chave: string) => string): LinhaCruzada[] {
  const sinal = ordem.desc ? -1 : 1;
  if (ordem.por === "rotulo") return [...c.linhas].sort((a, b) => sinal * colator.compare(a.rotulo, b.rotulo));
  if (ordem.por === "extra") {
    // Vazios sempre no fim; empate pelo rótulo.
    const ex = (l: LinhaCruzada) => extraDe?.(l.chave) ?? "";
    return [...c.linhas].sort((a, b) => {
      const x = ex(a);
      const y = ex(b);
      if (!x || !y) return x === y ? colator.compare(a.rotulo, b.rotulo) : x ? -1 : 1;
      return sinal * colator.compare(x, y) || colator.compare(a.rotulo, b.rotulo);
    });
  }
  const j = typeof ordem.por === "object" ? c.colunas.findIndex((x) => x.chave === (ordem.por as { coluna: string }).coluna) : -1;
  const chave = (l: LinhaCruzada) => (j >= 0 ? l.valores[j] : l.total);
  return [...c.linhas].sort((a, b) => sinal * (chave(a) - chave(b)) || colator.compare(a.rotulo, b.rotulo));
}

/** Ordem das COLUNAS: pelo rótulo (A–Z / Z–A) ou pelo total (maior / menor primeiro). */
export type OrdemColunas = "rotulo" | "rotulo-desc" | "total-desc" | "total-asc";

/** Reordena as colunas e tira as OCULTAS (os `valores` das linhas acompanham; os totais seguem os do cruzamento). */
export function reordenarColunas(c: Cruzamento, ordem: OrdemColunas, ocultas: string[] = []): Cruzamento {
  const fora = new Set(ocultas);
  const idx = c.colunas.map((_, j) => j).filter((j) => !fora.has(c.colunas[j].chave));
  const cmp: Record<OrdemColunas, (a: number, b: number) => number> = {
    rotulo: (a, b) => colator.compare(c.colunas[a].rotulo, c.colunas[b].rotulo),
    "rotulo-desc": (a, b) => colator.compare(c.colunas[b].rotulo, c.colunas[a].rotulo),
    "total-desc": (a, b) => c.colunas[b].total - c.colunas[a].total || colator.compare(c.colunas[a].rotulo, c.colunas[b].rotulo),
    "total-asc": (a, b) => c.colunas[a].total - c.colunas[b].total || colator.compare(c.colunas[a].rotulo, c.colunas[b].rotulo),
  };
  idx.sort(cmp[ordem] ?? cmp.rotulo);
  return { ...c, colunas: idx.map((j) => c.colunas[j]), linhas: c.linhas.map((l) => ({ ...l, valores: idx.map((j) => l.valores[j]) })) };
}

/** Chaves especiais das colunas FIXAS da tabela (para larguras e ocultar). */
export const COL_ROTULO = "__rotulo";
export const COL_EXTRA = "__extra";
export const COL_TOTAL = "__total";
export const LARGURA_MIN = 56;
export const LARGURA_MAX = 640;

/** Os AJUSTES da tabela que o usuário pode SALVAR: larguras (px por coluna), colunas fixadas (na ordem) e ocultas, a
 * ordem das linhas e a das colunas. */
export type LayoutCruzamento = {
  larguras: Record<string, number>;
  fixadas: string[];
  ocultas: string[];
  ordemLinhas: OrdemCruzamento;
  ordemColunas: OrdemColunas;
};

export const LAYOUT_PADRAO: LayoutCruzamento = { larguras: {}, fixadas: [], ocultas: [], ordemLinhas: { por: "rotulo", desc: false }, ordemColunas: "rotulo" };

/** A chave do layout salvo do Comparativo — um por PAR de colunas ligadas (as colunas mudam com o par). */
export const chaveLayoutComparativo = (linha: DimensaoOrcamento, coluna: DimensaoOrcamento) => `orcamento-comparativo:${linha}:${coluna}`;

const ORDENS_COLUNAS: OrdemColunas[] = ["rotulo", "rotulo-desc", "total-desc", "total-asc"];
const listaChaves = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 300))].slice(0, 500) : [];

/** Qualquer JSON → layout VÁLIDO e canônico (larguras no intervalo e em ordem de chave; sem repetição) — o salvo nunca
 * quebra a tabela, e dois layouts iguais têm o mesmo JSON (`layoutIgual`). */
export function coerceLayout(v: unknown): LayoutCruzamento {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const larguras: Record<string, number> = {};
  if (o.larguras && typeof o.larguras === "object" && !Array.isArray(o.larguras)) {
    for (const [k, w] of Object.entries(o.larguras as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).slice(0, 500)) {
      if (k.length && k.length <= 300 && typeof w === "number" && Number.isFinite(w)) larguras[k] = Math.round(Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, w)));
    }
  }
  const ol = o.ordemLinhas as { por?: unknown; desc?: unknown } | undefined;
  const por =
    ol?.por === "rotulo" || ol?.por === "extra" || ol?.por === "total"
      ? ol.por
      : ol?.por && typeof ol.por === "object" && typeof (ol.por as { coluna?: unknown }).coluna === "string"
        ? { coluna: (ol.por as { coluna: string }).coluna }
        : "rotulo";
  return {
    larguras,
    fixadas: listaChaves(o.fixadas),
    ocultas: listaChaves(o.ocultas),
    ordemLinhas: { por, desc: ol?.desc === true },
    ordemColunas: ORDENS_COLUNAS.includes(o.ordemColunas as OrdemColunas) ? (o.ordemColunas as OrdemColunas) : "rotulo",
  };
}

export const layoutIgual = (a: LayoutCruzamento, b: LayoutCruzamento) => JSON.stringify(coerceLayout(a)) === JSON.stringify(coerceLayout(b));

/** Como as células se leem: o VALOR ou a participação (% da linha, da coluna ou do total geral). */
export type ModoCruzamento = "valor" | "linha" | "coluna" | "total";

/** A base do percentual de uma célula no modo (`null` = mostrar o valor). A célula de total da LINHA usa como base da
 * coluna o total geral; a de total da COLUNA usa como base da linha o total geral. */
export function basePercentual(modo: ModoCruzamento, bases: { linha: number; coluna: number; geral: number }): number | null {
  if (modo === "valor") return null;
  return modo === "linha" ? bases.linha : modo === "coluna" ? bases.coluna : bases.geral;
}

/** O percentual da célula (`null` quando a base é zero). */
export const percentual = (v: number, base: number): number | null => (zerado(base) ? null : (v / base) * 100);

/** Os lançamentos que formam UMA célula (linha e coluna), uma LINHA inteira (coluna `null`), uma COLUNA inteira (linha
 * `null`) ou o total (os dois `null`) — a MESMA chave do `cruzar`. */
export function lancamentosDoRecorte<T extends LinhaOrcamentoVisao>(
  itens: T[],
  dimLinha: DimensaoOrcamento,
  dimColuna: DimensaoOrcamento,
  linha: string | null,
  coluna: string | null,
): T[] {
  return itens.filter((l) => (linha == null || chaveDe(l, dimLinha) === linha) && (coluna == null || chaveDe(l, dimColuna) === coluna));
}

/** A matriz para EXPORTAR (planilha): cabeçalho + linhas (+ a coluna extra, ex.: a sigla no sistema) + a linha TOTAL. */
export function matrizCruzamento(
  c: Cruzamento,
  linhas: LinhaCruzada[],
  rotuloLinhas: string,
  extra?: { rotulo: string; de: (chave: string) => string },
): (string | number)[][] {
  const arred = (v: number) => Math.round(v * 100) / 100;
  const cab = [rotuloLinhas, ...(extra ? [extra.rotulo] : []), "Total", ...c.colunas.map((x) => x.rotulo)];
  const corpo = linhas.map((l) => [l.rotulo, ...(extra ? [extra.de(l.chave)] : []), arred(l.total), ...l.valores.map(arred)]);
  const tot = ["TOTAL", ...(extra ? [""] : []), arred(c.total), ...c.colunas.map((x) => arred(x.total))];
  return [cab, ...corpo, tot];
}
