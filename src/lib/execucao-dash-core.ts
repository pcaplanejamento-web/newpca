/**
 * O DASHBOARD DA EXECUÇÃO — o núcleo PURO (testado em `tests/execucao-dash.test.ts`). Junta empenhos, liquidações e
 * pagamentos pelo NÚMERO do empenho (a ligação é feita no banco — `execucao-sql.ts` — com a régua de `destinoSql`) e dá
 * TODOS os números da tela: os indicadores, o funil, a série (diária e acumulada), as opções dos filtros e a origem de cada
 * ponto. Nenhuma tela soma por conta própria.
 *
 * Regras (as mesmas em todo número):
 * - VALORES em INTEIROS de 1/10.000 de real (`ESCALA`): a Centi manda até 3 casas; cada registro é arredondado UMA vez no
 *   banco e as somas são exatas (a soma das partes é o total).
 * - Empenhado = valor empenhado − anulado (a anulação NÃO tem data na Centi — fica na data do empenho). Liquidado = valor −
 *   anulado das liquidações. Pago = valor das ordens NÃO anuladas (a régua de `conferirExecucao`, medida em 2025); retido e
 *   pago líquido só das não anuladas; o anulado das ordens à parte.
 * - Cada etapa conta pela PRÓPRIA data (o que entrou no período — os restos a pagar inclusive); o TIPO separa as
 *   liquidações e os pagamentos em Nota de Empenho e Restos a Pagar (`tipoDaExecucao`, a régua das tabelas).
 * - Liquidação/pagamento SEM o empenho no sistema = o valor "Sem empenho no sistema" em todo filtro do empenho (o órgão vem
 *   do próprio registro); conta no movimento e nunca some.
 */
import { type TipoExecucao, tipoDaExecucao } from "./execucao-empenho-core.ts";
import { baldesData, type BaldeData, type GranularidadeData } from "./mesa-metricas.ts";

/** Os valores chegam em inteiros de 1/ESCALA de real. */
export const ESCALA = 10_000;
/** Inteiros → reais (só na hora de mostrar). */
export const reais = (u: number): number => u / ESCALA;

/** As dimensões do EMPENHO que vão pelo dicionário (a ordem é a da tupla). */
export const DIMS_DICIONARIO = [
  "unidade",
  "orgaoGestor",
  "unidadeOrcamentaria",
  "funcao",
  "subfuncao",
  "programa",
  "acao",
  "elemento",
  "subelemento",
  "fonte",
  "modalidade",
  "licitacao",
  "fornecedor",
] as const;
export type DimDicionario = (typeof DIMS_DICIONARIO)[number];
/** Todas as dimensões dos filtros: o dicionário + o ÓRGÃO do cadastro (pelo id). */
export type DimExec = DimDicionario | "orgao";
/**
 * As dimensões dos FILTROS: a Unidade e o Órgão do SISTEMA (o cadastro — prevalecem sobre o órgão gestor e a unidade
 * orçamentária da Centi, que diriam o mesmo com outro nome) e as classificações do ORÇAMENTO, depois a compra.
 */
export const DIMS_EXEC: readonly DimExec[] = ["unidade", "orgao", "funcao", "subfuncao", "programa", "acao", "elemento", "subelemento", "fonte", "modalidade", "licitacao", "fornecedor"];

export const ROTULO_DIM: Record<DimExec, string> = {
  unidade: "Unidade",
  orgao: "Órgão",
  orgaoGestor: "Órgão gestor",
  unidadeOrcamentaria: "Unidade orçamentária",
  funcao: "Função",
  subfuncao: "Subfunção",
  programa: "Programa",
  acao: "Ação",
  elemento: "Elemento",
  subelemento: "Subelemento",
  fonte: "Fonte",
  modalidade: "Modalidade",
  licitacao: "Licitação",
  fornecedor: "Credor",
};


/** As chaves especiais de opção: o valor vazio e o registro sem empenho no sistema. */
export const CHAVE_VAZIO = "~";
export const CHAVE_SEM_EMPENHO = "!";
export const ROTULO_VAZIO = "Não informado";
export const ROTULO_SEM_EMPENHO = "Sem empenho no sistema";

export type Granularidade = "auto" | Exclude<GranularidadeData, "ano">;

/** Situação de um TIPO de card (a faixa de confiança). */
export type MetaExec = { tipo: "empenhos" | "liquidacoes" | "pagamentos"; cards: number; atualizado: string | null; lendo: number; problemas: number };

/** O que a rota entrega (TEXTO JSON montado no banco). */
export type PacoteExec = {
  /** A versão dos dados (muda a cada importação promovida ou vínculo). */
  v: string;
  /** Os anos carregados e os que existem. */
  anos: number[];
  disponiveis: number[];
  /** Quais etapas a pessoa pode ver (a tela de cada uma). */
  fontes: { liquidacoes: boolean; pagamentos: boolean };
  meta: MetaExec[];
  /** [id, sigla ou nome, nome] dos órgãos do cadastro citados. */
  orgaos: [number, string, string][];
  /** O dicionário de cada dimensão: [índice, texto]. */
  dic: Partial<Record<DimDicionario, [number, string | null][]>>;
  /** [id, número, noRecorte(0|1), órgãoId, dia, …índices das dimensões, empenhado, anulado, liquidado, pago, saldo]. */
  emp: (number | string | null)[][];
  /** [empenho (índice ou -1), órgãoId (sem empenho), dia, valor, anulado, quantidade, quantas com anulação]. */
  liq: (number | null)[][];
  /** [empenho, órgãoId, dia, pago, retido, pago líquido, anulado, quantidade, anuladas]. */
  pag: (number | null)[][];
};

const DIA0 = Date.UTC(2000, 0, 1);
const DIA_MS = 86_400_000;
/** O dia (inteiro desde 2000-01-01, como o banco manda) → AAAA-MM-DD. */
export const isoDoDia = (d: number): string => new Date(DIA0 + d * DIA_MS).toISOString().slice(0, 10);
/** AAAA-MM-DD → o dia inteiro (inválido = null). */
export function diaDoIso(iso: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(t)) return null;
  const d = Math.round((t - DIA0) / DIA_MS);
  // Recusa o dia inexistente (13/40 "rola" para outro mês no Date.UTC).
  return isoDoDia(d) === iso ? d : null;
}

const SEM_DIA = -2147483648;
const n = (x: unknown): number => {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
};

/** A base INDEXADA (colunas em arrays — uma passada linear por mudança de filtro). */
export type BaseExec = {
  fontes: PacoteExec["fontes"];
  meta: MetaExec[];
  anos: number[];
  disponiveis: number[];
  orgaos: Map<number, { sigla: string; nome: string }>;
  /** Os textos de cada dimensão do dicionário (índice → texto; `null` = vazio). */
  dic: Record<DimDicionario, (string | null)[]>;
  emp: {
    n: number;
    id: Int32Array;
    numero: string[];
    r: Uint8Array;
    org: Int32Array;
    dia: Int32Array;
    dims: Record<DimDicionario, Int32Array>;
    bruto: Float64Array;
    anulado: Float64Array;
    liquidado: Float64Array;
    pago: Float64Array;
    saldo: Float64Array;
  };
  /** `tipo`: 0 = Nota de Empenho, 1 = Restos a Pagar, 2 = erro (empenho de ano posterior) — `tipoDaExecucao`. */
  liq: { n: number; ei: Int32Array; org: Int32Array; dia: Int32Array; valor: Float64Array; anulado: Float64Array; qtd: Int32Array; anuladas: Int32Array; tipo: Uint8Array };
  pag: {
    n: number;
    ei: Int32Array;
    org: Int32Array;
    dia: Int32Array;
    pago: Float64Array;
    retido: Float64Array;
    liquido: Float64Array;
    anulado: Float64Array;
    qtd: Int32Array;
    anuladas: Int32Array;
    tipo: Uint8Array;
  };
};

/** O TIPO de uma liquidação/pagamento (a régua de `tipoDaExecucao`, a das tabelas): o ano do empenho ligado × o do registro. */
const TIPO_CODIGO: Record<TipoExecucao["tipo"], number> = { ne: 0, rp: 1, erro: 2 };
const anoDoDia = new Map<number, number>();
function tipoDoEvento(diasEmp: Int32Array, ei: number, dia: number): number {
  const ano = (d: number) => {
    if (d === SEM_DIA) return null;
    let a = anoDoDia.get(d);
    if (a === undefined) {
      a = Number(isoDoDia(d).slice(0, 4));
      anoDoDia.set(d, a);
    }
    return a;
  };
  const anoEmp = ei >= 0 ? ano(diasEmp[ei]) : null;
  const data = dia === SEM_DIA ? null : isoDoDia(dia);
  // O registro sem empenho no sistema traz o número (é de um empenho não importado): Restos a Pagar presumido.
  return TIPO_CODIGO[tipoDaExecucao("n", anoEmp, data).tipo];
}

/** O filtro de TIPO das liquidações e dos pagamentos: as chaves escolhidas (vazio ou as duas = todos). */
export type TipoFiltroExec = readonly ("ne" | "rp")[];
export const OPCOES_TIPO: readonly { chave: "ne" | "rp"; rotulo: string }[] = [
  { chave: "ne", rotulo: "Nota de Empenho" },
  { chave: "rp", rotulo: "Restos a Pagar" },
];

/** Os meses ("AAAA-MM") com registro nos anos carregados — empenhos (os dos anos pedidos), liquidações e pagamentos. O
 * seletor de período só oferece estes; os anos ainda não carregados ficam com a regra "até hoje" do seletor. */
export function mesesComDados(b: BaseExec): string[] {
  const s = new Set<string>();
  const vistos = new Set<number>();
  const juntar = (d: number) => {
    // Cada dia é convertido uma vez (milhares de registros caem nos mesmos dias).
    if (d === SEM_DIA || vistos.has(d)) return;
    vistos.add(d);
    s.add(isoDoDia(d).slice(0, 7));
  };
  for (let k = 0; k < b.emp.n; k++) if (b.emp.r[k]) juntar(b.emp.dia[k]);
  for (let k = 0; k < b.liq.n; k++) juntar(b.liq.dia[k]);
  for (let k = 0; k < b.pag.n; k++) juntar(b.pag.dia[k]);
  return [...s].sort();
}

/**
 * Os ANOS a carregar para um intervalo (o Período é o filtro de tempo — os anos seguem ele): os anos com dados que o
 * intervalo cobre, os mais recentes primeiro, até `max`; sem limites = os mais recentes. Nenhum com dados = o mais
 * recente (o intervalo zera os números — nada inventado).
 */
export function anosDoIntervalo(i: IntervaloExec, disponiveis: readonly number[], max = 5): number[] {
  const ord = [...disponiveis].sort((a, b) => b - a);
  if (!i.de && !i.ate) return ord.slice(0, max);
  const de = i.de ? Number(i.de.slice(0, 4)) : Number.NEGATIVE_INFINITY;
  const ate = i.ate ? Number(i.ate.slice(0, 4)) : Number.POSITIVE_INFINITY;
  const l = ord.filter((a) => a >= de && a <= ate).slice(0, max);
  return l.length ? l : ord.slice(0, 1);
}

/** O pacote → a base indexada (nada quebra com dado faltando: número inválido = 0, índice fora = vazio). */
export function montarBase(p: PacoteExec): BaseExec {
  const dic = {} as Record<DimDicionario, (string | null)[]>;
  for (const d of DIMS_DICIONARIO) {
    const l: (string | null)[] = [];
    for (const [i, v] of p.dic[d] ?? []) if (Number.isInteger(i) && i >= 0) l[i] = v == null || v === "" ? null : String(v);
    dic[d] = l;
  }
  const nD = DIMS_DICIONARIO.length;
  const E = p.emp ?? [];
  const ne = E.length;
  const dims = {} as Record<DimDicionario, Int32Array>;
  for (const d of DIMS_DICIONARIO) dims[d] = new Int32Array(ne);
  const emp: BaseExec["emp"] = {
    n: ne,
    id: new Int32Array(ne),
    numero: new Array(ne),
    r: new Uint8Array(ne),
    org: new Int32Array(ne),
    dia: new Int32Array(ne),
    dims,
    bruto: new Float64Array(ne),
    anulado: new Float64Array(ne),
    liquidado: new Float64Array(ne),
    pago: new Float64Array(ne),
    saldo: new Float64Array(ne),
  };
  for (let i = 0; i < ne; i++) {
    const t = E[i];
    emp.id[i] = n(t[0]);
    emp.numero[i] = String(t[1] ?? "");
    emp.r[i] = n(t[2]) ? 1 : 0;
    emp.org[i] = n(t[3]);
    emp.dia[i] = t[4] == null ? SEM_DIA : n(t[4]);
    for (let k = 0; k < nD; k++) {
      const v = t[5 + k];
      dims[DIMS_DICIONARIO[k]][i] = v == null ? -1 : n(v);
    }
    emp.bruto[i] = n(t[5 + nD]);
    emp.anulado[i] = n(t[6 + nD]);
    emp.liquidado[i] = n(t[7 + nD]);
    emp.pago[i] = n(t[8 + nD]);
    emp.saldo[i] = n(t[9 + nD]);
  }
  const ei = (x: unknown) => {
    const v = Number(x);
    return Number.isInteger(v) && v >= 0 && v < ne ? v : -1;
  };
  const L = p.liq ?? [];
  const liq: BaseExec["liq"] = {
    n: L.length,
    ei: new Int32Array(L.length),
    org: new Int32Array(L.length),
    dia: new Int32Array(L.length),
    valor: new Float64Array(L.length),
    anulado: new Float64Array(L.length),
    qtd: new Int32Array(L.length),
    anuladas: new Int32Array(L.length),
    tipo: new Uint8Array(L.length),
  };
  L.forEach((t, i) => {
    liq.ei[i] = ei(t[0]);
    liq.org[i] = liq.ei[i] >= 0 ? emp.org[liq.ei[i]] : n(t[1]);
    liq.dia[i] = t[2] == null ? SEM_DIA : n(t[2]);
    liq.valor[i] = n(t[3]);
    liq.anulado[i] = n(t[4]);
    liq.qtd[i] = n(t[5]);
    liq.anuladas[i] = n(t[6]);
    liq.tipo[i] = tipoDoEvento(emp.dia, liq.ei[i], liq.dia[i]);
  });
  const P = p.pag ?? [];
  const pag: BaseExec["pag"] = {
    n: P.length,
    ei: new Int32Array(P.length),
    org: new Int32Array(P.length),
    dia: new Int32Array(P.length),
    pago: new Float64Array(P.length),
    retido: new Float64Array(P.length),
    liquido: new Float64Array(P.length),
    anulado: new Float64Array(P.length),
    qtd: new Int32Array(P.length),
    anuladas: new Int32Array(P.length),
    tipo: new Uint8Array(P.length),
  };
  P.forEach((t, i) => {
    pag.ei[i] = ei(t[0]);
    pag.org[i] = pag.ei[i] >= 0 ? emp.org[pag.ei[i]] : n(t[1]);
    pag.dia[i] = t[2] == null ? SEM_DIA : n(t[2]);
    pag.pago[i] = n(t[3]);
    pag.retido[i] = n(t[4]);
    pag.liquido[i] = n(t[5]);
    pag.anulado[i] = n(t[6]);
    pag.qtd[i] = n(t[7]);
    pag.anuladas[i] = n(t[8]);
    pag.tipo[i] = tipoDoEvento(emp.dia, pag.ei[i], pag.dia[i]);
  });
  const orgaos = new Map<number, { sigla: string; nome: string }>();
  for (const [id, sigla, nome] of p.orgaos ?? []) orgaos.set(n(id), { sigla: String(sigla ?? ""), nome: String(nome ?? "") });
  return {
    fontes: { liquidacoes: !!p.fontes?.liquidacoes, pagamentos: !!p.fontes?.pagamentos },
    meta: p.meta ?? [],
    anos: p.anos ?? [],
    disponiveis: p.disponiveis ?? [],
    orgaos,
    dic,
    emp,
    liq,
    pag,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------------------------------------------

/** Os filtros escolhidos: por dimensão, as CHAVES das opções (QUALQUER uma; vazio = sem filtro). */
export type FiltrosExec = Partial<Record<DimExec, readonly string[]>>;
/** O recorte de tempo: dias inteiros [de, ate] (ausente = sem limite). */
export type IntervaloExec = { de?: string; ate?: string };

/** A chave da opção de um empenho numa dimensão. */
function chaveEmp(b: BaseExec, d: DimExec, i: number): string {
  if (d === "orgao") return String(b.emp.org[i]);
  const k = b.emp.dims[d][i];
  return k < 0 || b.dic[d][k] == null ? CHAVE_VAZIO : String(k);
}
/** A chave de um evento SEM empenho: o órgão do registro; nas demais dimensões, "Sem empenho no sistema". */
const chaveSemEmp = (d: DimExec, org: number): string => (d === "orgao" ? String(org) : CHAVE_SEM_EMPENHO);

/** O rótulo de uma opção (único por dimensão — os textos do dicionário são distintos). */
export function rotuloOpcao(b: BaseExec, d: DimExec, chave: string): string {
  if (chave === CHAVE_SEM_EMPENHO) return ROTULO_SEM_EMPENHO;
  if (chave === CHAVE_VAZIO) return ROTULO_VAZIO;
  if (d === "orgao") return b.orgaos.get(Number(chave))?.sigla || `Órgão ${chave}`;
  return b.dic[d][Number(chave)] ?? ROTULO_VAZIO;
}
/** O detalhe da opção (o nome do órgão, quando a sigla é o rótulo). */
export function detalheOpcao(b: BaseExec, d: DimExec, chave: string): string | undefined {
  if (d !== "orgao") return undefined;
  const o = b.orgaos.get(Number(chave));
  return o?.nome && o.nome !== o.sigla ? o.nome : undefined;
}

type Ativos = { d: DimExec; set: Set<string> }[];
const ativosDe = (f: FiltrosExec): Ativos =>
  DIMS_EXEC.flatMap((d) => {
    const l = f[d];
    return l?.length ? [{ d, set: new Set(l) }] : [];
  });

/**
 * As FALHAS de cada registro nos filtros ativos: 0 = passa em todos; 1..k = o índice (+1) do ÚNICO filtro em que falha;
 * -1 = falha em dois ou mais. Com isso UMA passada dá o que passa em tudo e o que passa "em todos menos um" (as opções
 * conectadas de cada dimensão e o gráfico desenhado sem o próprio filtro).
 */
function falhas(chaveDe: (d: DimExec) => string, at: Ativos): number {
  let f = 0;
  for (let k = 0; k < at.length; k++) {
    if (!at[k].set.has(chaveDe(at[k].d))) {
      if (f !== 0) return -1;
      f = k + 1;
    }
  }
  return f;
}

/** Os registros contados pela visão e pelo período (antes dos filtros das dimensões). */
type Contagem = { emp: Uint8Array; liq: Uint8Array; pag: Uint8Array };

function dentroDe(dia: number, de: number | null, ate: number | null): boolean {
  if (de == null && ate == null) return true;
  if (dia === SEM_DIA) return false;
  return (de == null || dia >= de) && (ate == null || dia <= ate);
}

/** O que conta no intervalo (sem os filtros de dimensão): os empenhos dos anos carregados e cada etapa pela própria data. */
function contados(b: BaseExec, i: IntervaloExec): Contagem {
  const de = diaDoIso(i.de);
  const ate = diaDoIso(i.ate);
  const emp = new Uint8Array(b.emp.n);
  for (let k = 0; k < b.emp.n; k++) emp[k] = b.emp.r[k] && dentroDe(b.emp.dia[k], de, ate) ? 1 : 0;
  const liq = new Uint8Array(b.liq.n);
  const pag = new Uint8Array(b.pag.n);
  for (let k = 0; k < b.liq.n; k++) liq[k] = dentroDe(b.liq.dia[k], de, ate) ? 1 : 0;
  for (let k = 0; k < b.pag.n; k++) pag[k] = dentroDe(b.pag.dia[k], de, ate) ? 1 : 0;
  if (!b.fontes.liquidacoes) liq.fill(0);
  if (!b.fontes.pagamentos) pag.fill(0);
  return { emp, liq, pag };
}

// ---------------------------------------------------------------------------------------------------------------
// O cálculo único
// ---------------------------------------------------------------------------------------------------------------

export type Totais = {
  empenhos: number;
  empBruto: number;
  empAnulado: number;
  /** empBruto − empAnulado. */
  empenhado: number;
  /** Empenhos com anulação. */
  empAnulados: number;
  liquidacoes: number;
  /** Liquidações com anulação. */
  liqAnuladas: number;
  liqBruto: number;
  liqAnulado: number;
  /** liqBruto − liqAnulado. */
  liquidado: number;
  pagamentos: number;
  /** Valor das ordens NÃO anuladas. */
  pago: number;
  retido: number;
  pagoLiquido: number;
  pagAnulado: number;
  pagAnuladas: number;
  fornecedores: number;
  /** Liquidações/pagamentos contados sem o empenho no sistema (quantidade e valor). */
  semEmpenho: number;
  semEmpenhoValor: number;
};

const totaisZero = (): Totais => ({
  empenhos: 0,
  empBruto: 0,
  empAnulado: 0,
  empenhado: 0,
  empAnulados: 0,
  liquidacoes: 0,
  liqAnuladas: 0,
  liqBruto: 0,
  liqAnulado: 0,
  liquidado: 0,
  pagamentos: 0,
  pago: 0,
  retido: 0,
  pagoLiquido: 0,
  pagAnulado: 0,
  pagAnuladas: 0,
  fornecedores: 0,
  semEmpenho: 0,
  semEmpenhoValor: 0,
});

/** Os índices que passam (os contados + todos os filtros). */
export type Selecao = { emp: Int32Array; liq: Int32Array; pag: Int32Array };

export type Calculo = {
  totais: Totais;
  /** O que passa em TUDO (a origem dos números). */
  sel: Selecao;
  /** As opções CONECTADAS de cada dimensão: chave → quantidade de registros (sem o filtro da própria dimensão). */
  opcoes: Record<DimExec, Map<string, number>>;
  /** Registros contados sem data (fora da série — avisados). */
  semData: { empenhos: number; liquidacoes: number; pagamentos: number };
  /** As opções CONECTADAS do filtro de tipo: chave → quantidade de liquidações e pagamentos (sem o filtro de tipo). */
  opcoesTipo: Map<string, number>;
};

/**
 * O CÁLCULO ÚNICO: visão + intervalo + filtros → os totais, os índices que passam e as opções conectadas. Linear nos
 * registros (uma passada por tipo).
 */
export function calcular(b: BaseExec, intervalo: IntervaloExec, filtros: FiltrosExec, tipos: TipoFiltroExec = []): Calculo {
  const c = contados(b, intervalo);
  const so = new Set(tipos);
  const tipoQuer = so.size === 1 ? (so.has("ne") ? 0 : 1) : -1;
  const opcoesTipo = new Map<string, number>();
  const contaTipo = (cod: number, q: number) => {
    const k = cod === 0 ? "ne" : cod === 1 ? "rp" : "";
    if (k) opcoesTipo.set(k, (opcoesTipo.get(k) ?? 0) + q);
  };
  const at = ativosDe(filtros);
  const opcoes = Object.fromEntries(DIMS_EXEC.map((d) => [d, new Map<string, number>()])) as Record<DimExec, Map<string, number>>;
  const conta = (d: DimExec, k: string) => {
    const m = opcoes[d];
    m.set(k, (m.get(k) ?? 0) + 1);
  };
  /** Soma nas opções: f = 0 → em todas as dimensões; f = k → só na dimensão do filtro em que falhou. */
  const noTopo = (f: number, chaveDe: (d: DimExec) => string) => {
    if (f === 0) for (const d of DIMS_EXEC) conta(d, chaveDe(d));
    else if (f > 0) {
      const d = at[f - 1].d;
      conta(d, chaveDe(d));
    }
  };
  const t = totaisZero();
  const semData = { empenhos: 0, liquidacoes: 0, pagamentos: 0 };
  const selE: number[] = [];
  const forn = new Set<number>();
  // "Restos a Pagar" é só a execução de empenhos de anos anteriores: nenhum empenho do período entra.
  const semEmpenhos = tipoQuer === 1;
  for (let i = 0; i < b.emp.n; i++) {
    if (!c.emp[i] || semEmpenhos) continue;
    const chave = (d: DimExec) => chaveEmp(b, d, i);
    const f = falhas(chave, at);
    noTopo(f, chave);
    if (f !== 0) continue;
    selE.push(i);
    t.empenhos++;
    t.empBruto += b.emp.bruto[i];
    t.empAnulado += b.emp.anulado[i];
    if (b.emp.anulado[i] > 0) t.empAnulados++;
    if (b.emp.dims.fornecedor[i] >= 0) forn.add(b.emp.dims.fornecedor[i]);
    if (b.emp.dia[i] === SEM_DIA) semData.empenhos++;
  }
  // A liquidação e o pagamento conferem os filtros pelo empenho ligado (sem ele, pela régua do "sem empenho").
  const chaveEv = (ei: number, org: number) => (d: DimExec) => (ei >= 0 ? chaveEmp(b, d, ei) : chaveSemEmp(d, org));
  const selL: number[] = [];
  for (let k = 0; k < b.liq.n; k++) {
    if (!c.liq[k]) continue;
    const ei = b.liq.ei[k];
    const tipoOk = tipoQuer < 0 || b.liq.tipo[k] === tipoQuer;
    const chave = chaveEv(ei, b.liq.org[k]);
    const f = falhas(chave, at);
    if (tipoOk) noTopo(f, chave);
    const ok = f === 0;
    if (ok) contaTipo(b.liq.tipo[k], b.liq.qtd[k]);
    if (!ok || !tipoOk) continue;
    selL.push(k);
    t.liquidacoes += b.liq.qtd[k];
    t.liqBruto += b.liq.valor[k];
    t.liqAnulado += b.liq.anulado[k];
    t.liqAnuladas += b.liq.anuladas[k];
    if (ei < 0) {
      t.semEmpenho += b.liq.qtd[k];
      t.semEmpenhoValor += b.liq.valor[k] - b.liq.anulado[k];
    }
    if (b.liq.dia[k] === SEM_DIA) semData.liquidacoes += b.liq.qtd[k];
  }
  const selP: number[] = [];
  for (let k = 0; k < b.pag.n; k++) {
    if (!c.pag[k]) continue;
    const ei = b.pag.ei[k];
    const tipoOk = tipoQuer < 0 || b.pag.tipo[k] === tipoQuer;
    const chave = chaveEv(ei, b.pag.org[k]);
    const f = falhas(chave, at);
    if (tipoOk) noTopo(f, chave);
    const ok = f === 0;
    if (ok) contaTipo(b.pag.tipo[k], b.pag.qtd[k]);
    if (!ok || !tipoOk) continue;
    selP.push(k);
    t.pagamentos += b.pag.qtd[k];
    t.pago += b.pag.pago[k];
    t.retido += b.pag.retido[k];
    t.pagoLiquido += b.pag.liquido[k];
    t.pagAnulado += b.pag.anulado[k];
    t.pagAnuladas += b.pag.anuladas[k];
    if (ei < 0) {
      t.semEmpenho += b.pag.qtd[k];
      t.semEmpenhoValor += b.pag.pago[k];
    }
    if (b.pag.dia[k] === SEM_DIA) semData.pagamentos += b.pag.qtd[k];
  }
  t.empenhado = t.empBruto - t.empAnulado;
  t.liquidado = t.liqBruto - t.liqAnulado;
  t.fornecedores = forn.size;
  return { totais: t, sel: { emp: Int32Array.from(selE), liq: Int32Array.from(selL), pag: Int32Array.from(selP) }, opcoes, semData, opcoesTipo };
}

/** Os percentuais das KPIs: o liquidado e o pago sobre o empenhado (sem empenhado, `null` = "—"). */
export function derivados(t: Totais): { pctLiquidado: number | null; pctPago: number | null } {
  return {
    pctLiquidado: t.empenhado > 0 ? t.liquidado / t.empenhado : null,
    pctPago: t.empenhado > 0 ? t.pago / t.empenhado : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// A série
// ---------------------------------------------------------------------------------------------------------------

export type PontoSerie = {
  chave: string;
  rotulo: string;
  titulo: string;
  de: string;
  ate: string;
  atual: boolean;
  empenhado: number;
  liquidado: number;
  pago: number;
  /** Acumulados desde o 1º balde. */
  acEmpenhado: number;
  acLiquidado: number;
  acPago: number;
  /** Quantos registros no balde: empenhos, liquidações e ordens de pagamento (não anuladas). */
  qEmp: number;
  qLiq: number;
  qPag: number;
};

export type Serie = { granularidade: GranularidadeData; pontos: PontoSerie[]; de: string | null; ate: string | null };

/** O limite de baldes de dia/semana (acima, o gráfico não teria leitura — a granularidade sobe). */
export const MAX_BALDES = 400;

/** Os dias dos registros SELECIONADOS (o intervalo da série quando o período é "todo"). */
function extremos(b: BaseExec, s: Selecao): [number, number] | null {
  let mi = Number.POSITIVE_INFINITY;
  let ma = Number.NEGATIVE_INFINITY;
  const ver = (d: number) => {
    if (d === SEM_DIA) return;
    if (d < mi) mi = d;
    if (d > ma) ma = d;
  };
  for (const i of s.emp) ver(b.emp.dia[i]);
  for (const k of s.liq) ver(b.liq.dia[k]);
  for (const k of s.pag) ver(b.pag.dia[k]);
  return mi <= ma ? [mi, ma] : null;
}

/**
 * A SÉRIE dos selecionados: os baldes do intervalo (o do período, cortado em HOJE quando passa dele; "todo" = do 1º ao
 * último dia com dado) na granularidade
 * pedida ("auto" = a de `baldesData`). Dia/semana com mais de `MAX_BALDES` baldes sobe para mês. O último acumulado = os
 * totais menos os registros sem data (invariante testado).
 */
export function serie(
  b: BaseExec,
  calc: Calculo,
  intervalo: IntervaloExec,
  gran: Granularidade,
  hoje: string,
  /** O ZOOM: os acumulados começam com o que veio de `acumularDesde` até antes do 1º balde (a janela continua o período). */
  opc: { acumularDesde?: string | null } = {},
): Serie {
  const ext = extremos(b, calc.sel);
  const de = intervalo.de ?? (ext ? isoDoDia(ext[0]) : null);
  // O período que passa de hoje (o ano atual, o mês atual) vai só ATÉ HOJE — o futuro não tem execução; um registro com
  // data depois de hoje estende até ele (nada some do acumulado).
  const ultimoDado = ext ? isoDoDia(ext[1]) : null;
  const limite = ultimoDado && ultimoDado > hoje ? ultimoDado : hoje;
  const ateBruto = intervalo.ate ?? ultimoDado;
  const ate = ateBruto && ateBruto > limite && (!de || de <= limite) ? limite : ateBruto;
  if (!de || !ate || de > ate) return { granularidade: "dia", pontos: [], de, ate };
  const nDias = (diaDoIso(ate) ?? 0) - (diaDoIso(de) ?? 0) + 1;
  let forcar: GranularidadeData | undefined = gran === "auto" ? undefined : gran;
  if (forcar === "dia" && nDias > MAX_BALDES) forcar = "semana";
  if (forcar === "semana" && nDias / 7 > MAX_BALDES) forcar = "mes";
  const { granularidade, baldes, chaveDoDia } = baldesData(de, ate, hoje, forcar);
  const pos = new Map(baldes.map((x: BaldeData, i) => [x.chave, i]));
  const em = new Float64Array(baldes.length);
  const lq = new Float64Array(baldes.length);
  const pg = new Float64Array(baldes.length);
  const qe = new Float64Array(baldes.length);
  const ql = new Float64Array(baldes.length);
  const qp = new Float64Array(baldes.length);
  const onde = (d: number): number => (d === SEM_DIA ? -1 : (pos.get(chaveDoDia(isoDoDia(d)) ?? "") ?? -1));
  for (const i of calc.sel.emp) {
    const p = onde(b.emp.dia[i]);
    if (p >= 0) {
      em[p] += b.emp.bruto[i] - b.emp.anulado[i];
      qe[p]++;
    }
  }
  for (const k of calc.sel.liq) {
    const p = onde(b.liq.dia[k]);
    if (p >= 0) {
      lq[p] += b.liq.valor[k] - b.liq.anulado[k];
      ql[p] += b.liq.qtd[k];
    }
  }
  for (const k of calc.sel.pag) {
    const p = onde(b.pag.dia[k]);
    if (p >= 0) {
      pg[p] += b.pag.pago[k];
      qp[p] += b.pag.qtd[k];
    }
  }
  let ae = 0;
  let al = 0;
  let ap = 0;
  const desde = diaDoIso(opc.acumularDesde ?? null);
  const antes = diaDoIso(baldes[0]?.de ?? null);
  if (desde != null && antes != null && desde < antes) {
    const cedo = (d: number) => d !== SEM_DIA && d >= desde && d < antes;
    for (const i of calc.sel.emp) if (cedo(b.emp.dia[i])) ae += b.emp.bruto[i] - b.emp.anulado[i];
    for (const k of calc.sel.liq) if (cedo(b.liq.dia[k])) al += b.liq.valor[k] - b.liq.anulado[k];
    for (const k of calc.sel.pag) if (cedo(b.pag.dia[k])) ap += b.pag.pago[k];
  }
  const pontos = baldes.map((x, i) => {
    ae += em[i];
    al += lq[i];
    ap += pg[i];
    return { chave: x.chave, rotulo: x.rotulo, titulo: x.titulo, de: x.de, ate: x.ate, atual: x.atual, empenhado: em[i], liquidado: lq[i], pago: pg[i], acEmpenhado: ae, acLiquidado: al, acPago: ap, qEmp: qe[i], qLiq: ql[i], qPag: qp[i] };
  });
  return { granularidade, pontos, de, ate };
}

/** O menor zoom: a janela não fica com menos dias que isto. */
export const MIN_DIAS_ZOOM = 7;

/**
 * O ZOOM do gráfico como uma JANELA DE DATAS dentro do período (`todo`): `fator` < 1 aproxima (menos dias, em volta do
 * centro da janela atual — a série é refeita nela, com a granularidade dela: um ano em meses vira semanas e depois dias),
 * > 1 afasta. Cobrir o período inteiro = null (sem zoom). Puro e testado.
 */
export function zoomJanela(atual: { de: string; ate: string } | null, todo: { de: string; ate: string }, fator: number): { de: string; ate: string } | null {
  const t0 = diaDoIso(todo.de);
  const t1 = diaDoIso(todo.ate);
  if (t0 == null || t1 == null || t1 < t0) return null;
  const a0 = Math.max(t0, diaDoIso(atual?.de) ?? t0);
  const a1 = Math.min(t1, diaDoIso(atual?.ate) ?? t1);
  const total = t1 - t0 + 1;
  const larg = Math.max(Math.min(MIN_DIAS_ZOOM, total), Math.round((a1 - a0 + 1) * fator));
  if (larg >= total) return null;
  const ini = Math.max(t0, Math.min(t1 - larg + 1, Math.round((a0 + a1) / 2 - (larg - 1) / 2)));
  return { de: isoDoDia(ini), ate: isoDoDia(ini + larg - 1) };
}

/** Anda com a janela do zoom meia largura para trás (−1) ou para a frente (+1), sem sair do período. */
export function deslocarJanela(atual: { de: string; ate: string }, todo: { de: string; ate: string }, sentido: -1 | 1): { de: string; ate: string } {
  const t0 = diaDoIso(todo.de);
  const t1 = diaDoIso(todo.ate);
  const a0 = diaDoIso(atual.de);
  const a1 = diaDoIso(atual.ate);
  if (t0 == null || t1 == null || a0 == null || a1 == null) return atual;
  const larg = a1 - a0 + 1;
  const ini = Math.max(t0, Math.min(t1 - larg + 1, a0 + sentido * Math.max(1, Math.round(larg / 2))));
  return { de: isoDoDia(ini), ate: isoDoDia(ini + larg - 1) };
}

/** Os índices selecionados que caem em [de, ate] (a ORIGEM de um ponto da série — a soma é o ponto). */
export function selecaoNoIntervalo(b: BaseExec, s: Selecao, de: string, ate: string): Selecao {
  const d0 = diaDoIso(de);
  const d1 = diaDoIso(ate);
  const ok = (d: number) => d !== SEM_DIA && (d0 == null || d >= d0) && (d1 == null || d <= d1);
  return {
    emp: s.emp.filter((i) => ok(b.emp.dia[i])),
    liq: s.liq.filter((k) => ok(b.liq.dia[k])),
    pag: s.pag.filter((k) => ok(b.pag.dia[k])),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// A tela: as opções dos filtros e as linhas da origem
// ---------------------------------------------------------------------------------------------------------------

export type OpcaoExec = { chave: string; rotulo: string; count: number; detalhe?: string };

/**
 * As opções de uma dimensão (as do recorte sem o filtro dela, com a quantidade de registros; as escolhidas ficam mesmo
 * zeradas — para poder desmarcar). Ordem: mais registros primeiro; "Não informado" e "Sem empenho no sistema" por último.
 */
export function opcoesDim(b: BaseExec, calc: Calculo, filtros: FiltrosExec, d: DimExec): OpcaoExec[] {
  const m = new Map(calc.opcoes[d]);
  for (const k of filtros[d] ?? []) if (!m.has(k)) m.set(k, 0);
  const fim = (k: string) => (k === CHAVE_VAZIO || k === CHAVE_SEM_EMPENHO ? 1 : 0);
  return [...m]
    .map(([chave, count]) => ({ chave, rotulo: rotuloOpcao(b, d, chave), count, detalhe: detalheOpcao(b, d, chave) }))
    .sort((x, y) => fim(x.chave) - fim(y.chave) || y.count - x.count || x.rotulo.localeCompare(y.rotulo, "pt-BR"));
}

/** Um empenho para a tela (as colunas da origem e o `EmpenhoDetalhe`). */
export type EmpenhoExec = {
  id: number;
  numero: string;
  data: string | null;
  orgao: string;
  unidade: string | null;
  orgaoGestor: string | null;
  unidadeOrcamentaria: string | null;
  fornecedor: string | null;
  modalidade: string | null;
  licitacao: string | null;
  funcao: string | null;
  subfuncao: string | null;
  programa: string | null;
  acao: string | null;
  elemento: string | null;
  subelemento: string | null;
  fonte: string | null;
  /** Em reais. */
  valorEmpenhado: number;
  valorAnulado: number;
  valorLiquidado: number;
  valorPago: number;
  saldoPagar: number;
};

export function empenhoExec(b: BaseExec, i: number): EmpenhoExec {
  const t = (d: DimDicionario) => {
    const k = b.emp.dims[d][i];
    return k >= 0 ? (b.dic[d][k] ?? null) : null;
  };
  return {
    id: b.emp.id[i],
    numero: b.emp.numero[i],
    data: b.emp.dia[i] === SEM_DIA ? null : isoDoDia(b.emp.dia[i]),
    orgao: rotuloOpcao(b, "orgao", String(b.emp.org[i])),
    unidade: t("unidade"),
    orgaoGestor: t("orgaoGestor"),
    unidadeOrcamentaria: t("unidadeOrcamentaria"),
    fornecedor: t("fornecedor"),
    modalidade: t("modalidade"),
    licitacao: t("licitacao"),
    funcao: t("funcao"),
    subfuncao: t("subfuncao"),
    programa: t("programa"),
    acao: t("acao"),
    elemento: t("elemento"),
    subelemento: t("subelemento"),
    fonte: t("fonte"),
    valorEmpenhado: reais(b.emp.bruto[i]),
    valorAnulado: reais(b.emp.anulado[i]),
    valorLiquidado: reais(b.emp.liquidado[i]),
    valorPago: reais(b.emp.pago[i]),
    saldoPagar: reais(b.emp.saldo[i]),
  };
}

/** Uma linha de liquidações/pagamentos da origem (um dia de um empenho — o banco agrupa por empenho e dia). */
export type EventoExec = {
  chave: string;
  /** O índice do empenho na base (-1 = sem empenho no sistema). */
  ei: number;
  numero: string | null;
  data: string | null;
  orgao: string;
  unidade: string | null;
  fornecedor: string | null;
  quantidade: number;
  /** Em reais: liquidações = líquido (valor − anulado) e anulado; pagamentos = pago, retido, líquido, anulado. */
  valor: number;
  anulado: number;
  retido: number;
  liquido: number;
};

export function liquidacaoExec(b: BaseExec, k: number): EventoExec {
  const ei = b.liq.ei[k];
  const e = ei >= 0 ? empenhoExec(b, ei) : null;
  return {
    chave: `l${k}`,
    ei,
    numero: e?.numero ?? null,
    data: b.liq.dia[k] === SEM_DIA ? null : isoDoDia(b.liq.dia[k]),
    orgao: rotuloOpcao(b, "orgao", String(b.liq.org[k])),
    unidade: e ? e.unidade : null,
    fornecedor: e?.fornecedor ?? null,
    quantidade: b.liq.qtd[k],
    valor: reais(b.liq.valor[k] - b.liq.anulado[k]),
    anulado: reais(b.liq.anulado[k]),
    retido: 0,
    liquido: reais(b.liq.valor[k] - b.liq.anulado[k]),
  };
}

export function pagamentoExec(b: BaseExec, k: number): EventoExec {
  const ei = b.pag.ei[k];
  const e = ei >= 0 ? empenhoExec(b, ei) : null;
  return {
    chave: `p${k}`,
    ei,
    numero: e?.numero ?? null,
    data: b.pag.dia[k] === SEM_DIA ? null : isoDoDia(b.pag.dia[k]),
    orgao: rotuloOpcao(b, "orgao", String(b.pag.org[k])),
    unidade: e ? e.unidade : null,
    fornecedor: e?.fornecedor ?? null,
    quantidade: b.pag.qtd[k],
    valor: reais(b.pag.pago[k]),
    anulado: reais(b.pag.anulado[k]),
    retido: reais(b.pag.retido[k]),
    liquido: reais(b.pag.liquido[k]),
  };
}

/** As últimas `semanas` semanas (domingo a sábado) até hoje: o EMPENHADO, o LIQUIDADO e o PAGO de cada (os sparks). */
export function sparks(b: BaseExec, s: Selecao, hoje: string, semanas = 8): { empenhado: number[]; liquidado: number[]; pago: number[] } {
  const h = diaDoIso(hoje) ?? 0;
  // 2000-01-01 foi um sábado (dia da semana 6, domingo = 0): o domingo da semana de `d` = d − ((d + 6) mod 7).
  const dom = (d: number) => d - ((((d + 6) % 7) + 7) % 7);
  const fim = dom(h);
  const ini = fim - (semanas - 1) * 7;
  const em = new Array(semanas).fill(0);
  const lq = new Array(semanas).fill(0);
  const pg = new Array(semanas).fill(0);
  const w = (d: number) => (d === SEM_DIA || d < ini || d > fim + 6 ? -1 : Math.floor((d - ini) / 7));
  for (const i of s.emp) {
    const k = w(b.emp.dia[i]);
    if (k >= 0) em[k] += b.emp.bruto[i] - b.emp.anulado[i];
  }
  for (const i of s.liq) {
    const k = w(b.liq.dia[i]);
    if (k >= 0) lq[k] += b.liq.valor[i] - b.liq.anulado[i];
  }
  for (const i of s.pag) {
    const k = w(b.pag.dia[i]);
    if (k >= 0) pg[k] += b.pag.pago[i];
  }
  return { empenhado: em, liquidado: lq, pago: pg };
}

/** A faixa de CONFIANÇA: a data mais antiga das últimas importações e o que pede atenção. */
export function confianca(meta: readonly MetaExec[], fontes: PacoteExec["fontes"], agoraMs: number): { atualizado: string | null; avisos: string[] } {
  const vistas = meta.filter((m) => m.cards > 0 && (m.tipo === "empenhos" || fontes[m.tipo]));
  const datas = vistas.map((m) => m.atualizado).filter((d): d is string => !!d);
  const atualizado = datas.length ? datas.sort()[0] : null;
  const nome = { empenhos: "empenhos", liquidacoes: "liquidações", pagamentos: "pagamentos" } as const;
  const avisos: string[] = [];
  for (const m of vistas) {
    if (m.lendo) avisos.push(`Importação de ${nome[m.tipo]} em andamento — os números podem mudar.`);
    if (m.problemas) avisos.push(`${m.problemas} card${m.problemas > 1 ? "s" : ""} de ${nome[m.tipo]} com a última importação com erro ou parcial.`);
    if (!m.atualizado) avisos.push(`Nenhuma importação de ${nome[m.tipo]} concluída.`);
    else {
      const t = Date.parse(m.atualizado.includes("T") ? m.atualizado : `${m.atualizado.replace(" ", "T")}Z`);
      if (Number.isFinite(t) && agoraMs - t > 2 * DIA_MS) avisos.push(`A última importação de ${nome[m.tipo]} tem mais de 2 dias.`);
    }
  }
  return { atualizado, avisos };
}

// ---------------------------------------------------------------------------------------------------------------
// O DEMONSTRATIVO (a tabela abaixo do gráfico)
// ---------------------------------------------------------------------------------------------------------------

/** Por onde o demonstrativo agrupa: uma dimensão dos filtros ou o MÊS (cada registro pela própria data). */
export type DimDemonstrativo = DimExec | "mes";

export type LinhaDemonstrativo = {
  chave: string;
  rotulo: string;
  detalhe?: string;
  empenhos: number;
  /** Em inteiros de 1/ESCALA: empenhado = bruto − anulado do empenho. */
  empenhado: number;
  anulado: number;
  liquidado: number;
  retido: number;
  pago: number;
};

/** A chave de um registro no demonstrativo (a do empenho ligado; sem empenho, a régua dos filtros; no mês, a própria data). */
function chaveDemo(b: BaseExec, d: DimDemonstrativo, ei: number, org: number, dia: number): string {
  if (d === "mes") return dia === SEM_DIA ? CHAVE_VAZIO : isoDoDia(dia).slice(0, 7);
  return ei >= 0 ? chaveEmp(b, d, ei) : chaveSemEmp(d, org);
}

const MESES_DEMO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * O DEMONSTRATIVO dos SELECIONADOS (os mesmos números das KPIs) agrupado por uma dimensão: a soma das linhas = os totais
 * (invariante testado). Ordem: mais empenhado primeiro (no mês, cronológica); "Não informado"/"Sem empenho" no fim.
 */
export function demonstrativo(b: BaseExec, calc: Pick<Calculo, "sel">, d: DimDemonstrativo): LinhaDemonstrativo[] {
  const m = new Map<string, LinhaDemonstrativo>();
  const linha = (k: string) => {
    let l = m.get(k);
    if (!l) {
      const rotulo = d === "mes" ? (k === CHAVE_VAZIO ? "Sem data" : `${MESES_DEMO[Number(k.slice(5, 7)) - 1]}/${k.slice(0, 4)}`) : rotuloOpcao(b, d, k);
      l = { chave: k, rotulo, detalhe: d === "mes" ? undefined : detalheOpcao(b, d, k), empenhos: 0, empenhado: 0, anulado: 0, liquidado: 0, retido: 0, pago: 0 };
      m.set(k, l);
    }
    return l;
  };
  for (const i of calc.sel.emp) {
    const l = linha(chaveDemo(b, d, i, b.emp.org[i], b.emp.dia[i]));
    l.empenhos++;
    l.empenhado += b.emp.bruto[i] - b.emp.anulado[i];
    l.anulado += b.emp.anulado[i];
  }
  for (const k of calc.sel.liq) linha(chaveDemo(b, d, b.liq.ei[k], b.liq.org[k], b.liq.dia[k])).liquidado += b.liq.valor[k] - b.liq.anulado[k];
  for (const k of calc.sel.pag) {
    const l = linha(chaveDemo(b, d, b.pag.ei[k], b.pag.org[k], b.pag.dia[k]));
    l.pago += b.pag.pago[k];
    l.retido += b.pag.retido[k];
  }
  const fim = (k: string) => (k === CHAVE_VAZIO || k === CHAVE_SEM_EMPENHO ? 1 : 0);
  return [...m.values()].sort((x, y) =>
    fim(x.chave) - fim(y.chave) || (d === "mes" ? x.chave.localeCompare(y.chave) : y.empenhado - x.empenhado || y.pago - x.pago || x.rotulo.localeCompare(y.rotulo, "pt-BR")),
  );
}

/** Os totais de uma SELEÇÃO (a origem de um recorte) — direto dos arrays, sem montar objetos (em inteiros de 1/ESCALA). */
export type ResumoSelecao = { empenhos: number; empenhado: number; anulado: number; liquidado: number; qLiq: number; pago: number; qPag: number; retido: number };

export function resumoSelecao(b: BaseExec, s: Selecao): ResumoSelecao {
  const r: ResumoSelecao = { empenhos: s.emp.length, empenhado: 0, anulado: 0, liquidado: 0, qLiq: 0, pago: 0, qPag: 0, retido: 0 };
  for (const i of s.emp) {
    r.empenhado += b.emp.bruto[i] - b.emp.anulado[i];
    r.anulado += b.emp.anulado[i];
  }
  for (const k of s.liq) {
    r.liquidado += b.liq.valor[k] - b.liq.anulado[k];
    r.qLiq += b.liq.qtd[k];
  }
  for (const k of s.pag) {
    r.pago += b.pag.pago[k];
    r.retido += b.pag.retido[k];
    r.qPag += b.pag.qtd[k];
  }
  return r;
}

/**
 * O SALDO entre duas etapas (a liquidar = empenhado − liquidado; a pagar = liquidado − pago) sem número negativo: quando a
 * etapa seguinte passa da anterior (restos a pagar — a execução de empenhos de outros períodos), o valor é o EXCEDENTE.
 */
export function saldoEtapa(de: number, ate: number): { valor: number; excedente: boolean } {
  return ate > de ? { valor: ate - de, excedente: true } : { valor: de - ate, excedente: false };
}

/** Os selecionados de UMA linha do demonstrativo (a origem dela — a soma é a linha). */
export function selecaoDaLinha(b: BaseExec, s: Selecao, d: DimDemonstrativo, chave: string): Selecao {
  return {
    emp: s.emp.filter((i) => chaveDemo(b, d, i, b.emp.org[i], b.emp.dia[i]) === chave),
    liq: s.liq.filter((k) => chaveDemo(b, d, b.liq.ei[k], b.liq.org[k], b.liq.dia[k]) === chave),
    pag: s.pag.filter((k) => chaveDemo(b, d, b.pag.ei[k], b.pag.org[k], b.pag.dia[k]) === chave),
  };
}
