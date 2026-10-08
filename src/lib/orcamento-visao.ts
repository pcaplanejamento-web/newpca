import { norm } from "./parse-dfd-comum.ts";

/**
 * VISÕES SALVAS do orçamento — núcleo PURO (sem `getDb`/JSX → testável). Uma visão = nome +, por
 * DIMENSÃO do CUBO, a lista de valores selecionados (vazia/ausente = "Todos"). Dentro da dimensão
 * vale QUALQUER valor marcado (OU); entre dimensões, TODAS têm de valer (E). As opções de cada
 * dimensão são CONECTADAS (facetas): vêm das linhas que passam nas DEMAIS dimensões.
 *
 * `DIMENSOES_ORCAMENTO` = TODAS as colunas de texto do CUBO + as duas do CADASTRO (Órgão/Unidade pelos Vínculos — os
 * lançamentos as ganham por `comVinculos`): o catálogo da tabela cruzada e dos lançamentos. Divisão de papéis (UMA régua,
 * sem conflito): a UNIDADE e as AÇÕES (e o órgão, que é a soma das unidades) são decididas SÓ pelos VÍNCULOS
 * (`DIMENSOES_DO_VINCULO`); a visão filtra SÓ o restante (`DIMENSOES_VISAO`: função, programa, elemento, código, ficha,
 * fonte). Uma visão nunca tira um lançamento de uma unidade nem de uma ação — isso é do vínculo.
 */

export type DimensaoOrcamento =
  | "orgaoSistema"
  | "unidadeSistema"
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
  // Do CADASTRO (pelos Vínculos — `comVinculos`): a unidade vinculada e o órgão dela; o órgão = a soma das unidades.
  { key: "orgaoSistema", rotulo: "Órgão (cadastro)", rotuloCurto: "órgão do cadastro" },
  { key: "unidadeSistema", rotulo: "Unidade (cadastro)", rotuloCurto: "unidade do cadastro" },
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

/** O que o VÍNCULO decide (unidade + ações; o órgão é a soma das unidades) — fora das visões. */
export const DIMENSOES_DO_VINCULO = ["orgaoSistema", "unidadeSistema", "orgao", "unidade", "acao"] as const;
export type DimensaoVisao = Exclude<DimensaoOrcamento, (typeof DIMENSOES_DO_VINCULO)[number]>;
const DO_VINCULO = new Set<string>(DIMENSOES_DO_VINCULO);
/** As dimensões que uma VISÃO filtra (o restante do CUBO). */
export const DIMENSOES_VISAO = DIMENSOES_ORCAMENTO.filter((d) => !DO_VINCULO.has(d.key)) as {
  key: DimensaoVisao;
  rotulo: string;
  rotuloCurto: string;
}[];

/** `{dimensão: valores[]}` — só as dimensões com seleção (só as da visão). */
export type FiltrosVisao = Partial<Record<DimensaoVisao, string[]>>;

export type VisaoOrcamento = {
  id: number;
  nome: string;
  filtros: FiltrosVisao;
  ordem: number;
  /** As unidades do CUBO (chaves) com VÍNCULOS PRÓPRIOS nesta visão — nas demais ela segue os vínculos padrão. */
  proprias: string[];
  /** Os PCAs que usam a visão (nome · ano) — editar/excluir a visão muda o orçamento deles. */
  pcas?: string[];
};

/** Linha mínima do orçamento que a visão filtra. */
export type LinhaOrcamentoVisao = Partial<Record<DimensaoOrcamento, string | null>>;

const CHAVES = new Set<string>(DIMENSOES_VISAO.map((d) => d.key));

/** Valor exibível de uma dimensão (vazio → "—"). */
export function valorDimensao(l: LinhaOrcamentoVisao, d: DimensaoOrcamento): string {
  const v = String(l[d] ?? "").trim();
  return v || "—";
}

/** Normaliza qualquer JSON em `FiltrosVisao` (chaves desconhecidas, as do VÍNCULO e valores inválidos fora; sem duplicar). */
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
    if (vals.length) out[k as DimensaoVisao] = vals;
  }
  return out;
}

type Conjuntos = Map<DimensaoVisao, Set<string>>;

function conjuntos(f: FiltrosVisao): Conjuntos {
  const m: Conjuntos = new Map();
  for (const d of DIMENSOES_VISAO) {
    const vals = f[d.key];
    if (vals?.length) m.set(d.key, new Set(vals.map(norm)));
  }
  return m;
}

function passa(l: LinhaOrcamentoVisao, c: Conjuntos, ignorar?: DimensaoVisao): boolean {
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
export function opcoesDaDimensao(linhas: LinhaOrcamentoVisao[], d: DimensaoVisao, filtros: FiltrosVisao): OpcaoDimensao[] {
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
  const partes = DIMENSOES_VISAO.flatMap((d) => {
    const n = filtros?.[d.key]?.length ?? 0;
    return n > 0 ? [`${n} ${d.rotuloCurto}`] : [];
  });
  return partes.length ? partes.join(" · ") : "Todos os lançamentos";
}

/** Um valor da visão que o orçamento NÃO traz (por dimensão) — sobra de um QDD anterior, renomeado ou retirado. */
export type AusentesVisao = { dimensao: DimensaoVisao; rotulo: string; valores: string[] }[];

/**
 * SINCRONIA visão × orçamento: os valores escolhidos na visão que NÃO existem nos lançamentos (comparados como o filtro
 * compara — `norm`). Eles não casam nada: depois de reenviar o QDD, a dotação cairia em silêncio. Vazio = em dia.
 */
export function valoresAusentes(linhas: LinhaOrcamentoVisao[], filtros: FiltrosVisao | null | undefined): AusentesVisao {
  const out: AusentesVisao = [];
  for (const d of DIMENSOES_VISAO) {
    const vals = filtros?.[d.key];
    if (!vals?.length) continue;
    const tem = new Set(linhas.map((l) => norm(valorDimensao(l, d.key))));
    const fora = vals.filter((v) => !tem.has(norm(v)));
    if (fora.length) out.push({ dimensao: d.key, rotulo: d.rotulo, valores: fora });
  }
  return out;
}

/** Total de valores ausentes. */
export const contarAusentes = (a: AusentesVisao) => a.reduce((s, x) => s + x.valores.length, 0);

/**
 * Os filtros SEM os valores ausentes + as dimensões que ficariam VAZIAS (o que nelas era escolhido sumiu inteiro do
 * orçamento — sem a dimensão, a visão passaria a pegar TODOS os valores dela; a tela avisa antes de gravar).
 */
export function semAusentes(filtros: FiltrosVisao, ausentes: AusentesVisao): { filtros: FiltrosVisao; esvaziadas: string[] } {
  const out: FiltrosVisao = { ...filtros };
  const esvaziadas: string[] = [];
  for (const a of ausentes) {
    const fora = new Set(a.valores.map(norm));
    const ficam = (filtros[a.dimensao] ?? []).filter((v) => !fora.has(norm(v)));
    if (ficam.length) out[a.dimensao] = ficam;
    else {
      delete out[a.dimensao];
      esvaziadas.push(a.rotulo);
    }
  }
  return { filtros: out, esvaziadas };
}

/** "215 - TRANSFERÊNCIA …" → código "215" e nome "TRANSFERENCIA …" (sem acento/caixa); sem " - ", o texto é o nome. */
function partesValor(v: string): { codigo: string | null; nome: string } {
  const m = /^\s*([0-9][0-9.\-/]*)\s+-\s+(.+)$/.exec(v);
  return m ? { codigo: m[1].replace(/\D/g, ""), nome: norm(m[2]) } : { codigo: null, nome: norm(v) };
}

/** Um valor da visão que ganhou o EQUIVALENTE nos dados novos. */
export type TrocaVisao = { dimensao: DimensaoVisao; rotulo: string; de: string; para: string };

/**
 * ADAPTA a visão aos DADOS NOVOS (QDD reenviado) com segurança: para cada valor escolhido que os lançamentos novos não
 * trazem, procura UM equivalente na mesma dimensão — o mesmo CÓDIGO (antes do " - ") ou, sem ele, o mesmo NOME — e o
 * ACRESCENTA (OU dentro da dimensão). Nunca tira valor: a visão é global (o valor antigo pode valer para o orçamento de
 * outro ano) e um valor ausente não soma nada. Ambíguo (2+ candidatos) ou sem equivalente = não mexe.
 */
export function adaptarVisao(filtros: FiltrosVisao, linhas: LinhaOrcamentoVisao[]): { filtros: FiltrosVisao; trocas: TrocaVisao[] } {
  const out: FiltrosVisao = { ...filtros };
  const trocas: TrocaVisao[] = [];
  for (const d of DIMENSOES_VISAO) {
    const vals = filtros[d.key];
    if (!vals?.length) continue;
    const distintos = new Map<string, string>();
    for (const l of linhas) {
      const v = valorDimensao(l, d.key);
      if (v !== "—") distintos.set(norm(v), v);
    }
    const candidatos = [...distintos.values()].map((v) => ({ v, ...partesValor(v) }));
    const lista = [...vals];
    const tem = new Set(lista.map(norm));
    for (const v of vals) {
      if (distintos.has(norm(v))) continue;
      const p = partesValor(v);
      const porCodigo = p.codigo ? candidatos.filter((c) => c.codigo === p.codigo) : [];
      const achados = porCodigo.length ? porCodigo : candidatos.filter((c) => c.nome === p.nome);
      if (achados.length !== 1 || tem.has(norm(achados[0].v))) continue;
      lista.push(achados[0].v);
      tem.add(norm(achados[0].v));
      trocas.push({ dimensao: d.key, rotulo: d.rotulo, de: v, para: achados[0].v });
    }
    out[d.key] = lista;
  }
  return { filtros: out, trocas };
}

/** Os extras de uma visão na lista (`Selecao`): o resumo + quantos PCAs a usam (2ª linha) e o aviso dos valores ausentes. */
export function atributosVisao(v: VisaoOrcamento, ausentes: number) {
  const pcas = v.pcas?.length ?? 0;
  return {
    "data-detalhe": `${resumoVisao(v.filtros)}${pcas > 0 ? ` · usada em ${pcas} PCA${pcas === 1 ? "" : "s"}` : ""}`,
    "data-aviso": ausentes > 0 ? `${ausentes} valor(es) da visão fora deste orçamento` : undefined,
  };
}
