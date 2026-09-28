import { CATEGORIAS, classificarAssunto } from "./avaliacao-core.ts";
import { dataBR, dataIsoBrasilia, mesLabel } from "./format.ts";
import { DIAS_ALERTA, type DfdPainel, type ProtocoloPainel, SEMANAS_PAINEL } from "./mesa-dashboard.ts";
import { tipoCurtoDfd } from "./parse-dfd-comum.ts";

/**
 * MÉTRICAS DE GOVERNANÇA da Mesa (a barra abaixo das KPIs do Dashboard) — PURAS/testáveis, SÓ sobre a execução da
 * Mesa: os protocolos e DFDs que ela já carregou (com os filtros do topo) + o HISTÓRICO de execução deles
 * (`/api/mesa/execucao`: reenvios e ações). Nada de fora da Mesa (PCA, orçamento, tarefas, calendário).
 *
 * - PERÍODO (dia/semana/mês/ano da data de referência, ou tudo) pela data da PROTOCOLAÇÃO (dia de Brasília); correções
 *   e ações pela data do EVENTO no histórico. A semana vai de segunda a domingo.
 * - PESSOA = o Responsável (padrão) ou a Distribuição (quem protocolou); as AÇÕES são de quem as fez (o ator).
 * - FOCO = o Responsável do topo da Mesa: numa pessoa, só ela, no papel escolhido — a MESMA linha dela na visão da
 *   equipe. As ações de cada pessoa contam em todo o recorte (nunca dependem desse filtro).
 * - NATUREZA = a categoria do assunto (INCLUSÃO/EXCLUSÃO/ALTERAÇÃO NÃO ONEROSA, senão OUTROS) + o ano do PCA.
 * - CORREÇÃO = o REENVIO do protocolo (o processo devolvido volta corrigido).
 * - Toda célula/coluna tem a sua ORIGEM: a soma da lista = o número tocado (as MESMAS contas).
 */

export type PeriodoMetricas = "tudo" | "ano" | "mes" | "semana" | "dia";
export const PERIODOS_METRICAS: readonly { value: PeriodoMetricas; label: string }[] = [
  { value: "tudo", label: "Tudo" },
  { value: "ano", label: "Ano" },
  { value: "mes", label: "Mês" },
  { value: "semana", label: "Semana" },
  { value: "dia", label: "Dia" },
];
/** As colunas das tabelas por período, da menor janela à Mesa inteira. */
export const COLUNAS_METRICAS: readonly PeriodoMetricas[] = ["dia", "semana", "mes", "ano", "tudo"];
export type Valores = Record<PeriodoMetricas, number>;

export type MedidaMetricas = "protocolos" | "dfds" | "itens" | "valor";
export const MEDIDAS_METRICAS: readonly { value: MedidaMetricas; label: string }[] = [
  { value: "protocolos", label: "Protocolos" },
  { value: "dfds", label: "DFDs" },
  { value: "itens", label: "Itens" },
  { value: "valor", label: "Valor" },
];

export type PessoaMetricas = "responsavel" | "distribuicao";
export const PESSOAS_METRICAS: readonly { value: PessoaMetricas; label: string }[] = [
  { value: "responsavel", label: "Responsável" },
  { value: "distribuicao", label: "Distribuição" },
];

export type TipoDfdMetricas = "DFD-S" | "DFD-R" | "DFD-O" | "DFD-E" | "sem";
export const TIPOS_DFD_METRICAS: readonly TipoDfdMetricas[] = ["DFD-S", "DFD-R", "DFD-O", "DFD-E", "sem"];
export const ROTULO_TIPO_METRICAS: Record<TipoDfdMetricas, string> = {
  "DFD-S": "DFD-S",
  "DFD-R": "DFD-R",
  "DFD-O": "DFD-O",
  "DFD-E": "DFD-E",
  sem: "Sem tipo",
};
/** Linha da tabela por tipo para o protocolo SEM nenhum DFD. */
export const CHAVE_SEM_DFDS = "sem-dfds";

export type FiltroMetricas = {
  periodo: PeriodoMetricas;
  /** Data de referência (AAAA-MM-DD, Brasília): o dia, a semana, o mês e o ano à vista. */
  ref: string;
  medida: MedidaMetricas;
  pessoa: PessoaMetricas;
  /** Rótulo da natureza (ex.: "INCLUSÃO 2027") — `null` = todas. */
  natureza: string | null;
  tipo: TipoDfdMetricas | null;
};

/** A barra como abre: Tudo (o Dashboard de sempre), protocolos, pelo Responsável, sem recorte. */
export const filtroMetricasPadrao = (hoje: string): FiltroMetricas => ({
  periodo: "tudo",
  ref: hoje,
  medida: "protocolos",
  pessoa: "responsavel",
  natureza: null,
  tipo: null,
});
/** Algum filtro de RECORTE ligado (natureza/tipo) — o "Limpar" da barra. */
export const recorteFiltrado = (f: FiltroMetricas) => f.natureza != null || f.tipo != null;

/** O FOCO das métricas = o Responsável do topo da Mesa: "todos" (a equipe), "sem" (os sem responsável) ou uma pessoa. */
export type FocoMetricas = "todos" | "sem" | number;

// ---------------------------------------------------------------------------
// Histórico de execução (as tuplas compactas de `/api/mesa/execucao`).
// ---------------------------------------------------------------------------

/** `reenvio` = o protocolo voltou corrigido (CORREÇÃO); `acao` = uma ação de execução (edição, vínculo, exclusão,
 * sobrescrita de DFD) feita por alguém. */
export type TipoAtividade = "reenvio" | "acao";
export type Atividade = { protocoloId: number; usuarioId: number | null; dia: string; tipo: TipoAtividade; n: number };
export type AtividadeTupla = [protocoloId: number, usuarioId: number | null, dia: string, tipo: TipoAtividade, n: number];
export const tuplaDaAtividade = (a: Atividade): AtividadeTupla => [a.protocoloId, a.usuarioId, a.dia, a.tipo, a.n];
export const atividadeDaTupla = ([protocoloId, usuarioId, dia, tipo, n]: AtividadeTupla): Atividade => ({ protocoloId, usuarioId, dia, tipo, n });

// ---------------------------------------------------------------------------
// Datas (dias de calendário de Brasília, "AAAA-MM-DD").
// ---------------------------------------------------------------------------

const DIA_MS = 86_400_000;
function partesIso(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
const numDia = (iso: string) => {
  const p = partesIso(iso);
  return p ? Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / DIA_MS) : null;
};
const isoDoNum = (n: number) => new Date(n * DIA_MS).toISOString().slice(0, 10);
const isoUtc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d)).toISOString().slice(0, 10);
const ultimoDiaDoMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();
/** Segunda-feira da semana do dia (1970-01-01 foi uma quinta) — a MESMA régua do Dashboard. */
const segunda = (n: number) => n - ((((n + 3) % 7) + 7) % 7);

/** Dia (Brasília) da protocolação — `null` sem data. */
export const diaDoProtocolo = (criadoEm: string | null | undefined): string | null => dataIsoBrasilia(criadoEm) || null;

/** O dia está na janela (`tudo` = sempre; ano/mês/dia = o da data de referência; semana = a dela, de segunda a domingo). */
export function noPeriodo(dia: string | null | undefined, periodo: PeriodoMetricas, ref: string): boolean {
  if (periodo === "tudo") return true;
  if (!dia) return false;
  if (periodo === "semana") {
    const n = numDia(dia);
    const r = numDia(ref);
    return n != null && r != null && segunda(n) === segunda(r);
  }
  const n = periodo === "ano" ? 4 : periodo === "mes" ? 7 : 10;
  return dia.slice(0, n) === ref.slice(0, n);
}

/** A semana (segunda → domingo) do dia: [início, fim] (AAAA-MM-DD) — `null` com data inválida. */
function semanaDoDia(ref: string): [string, string] | null {
  const n = numDia(ref);
  if (n == null) return null;
  const ini = segunda(n);
  return [isoDoNum(ini), isoDoNum(ini + 6)];
}

/** Anda um passo (dia, semana, mês ou ano) a partir da referência — o dia fica preso ao fim do mês (31/01 +1 mês =
 * 28/02). */
export function navegarRef(ref: string, periodo: PeriodoMetricas, passo: number): string {
  const p = partesIso(ref);
  if (!p || periodo === "tudo" || passo === 0) return ref;
  const [a, m, d] = p;
  if (periodo === "dia" || periodo === "semana") return isoUtc(a, m, d + passo * (periodo === "semana" ? 7 : 1));
  const meses = periodo === "mes" ? passo : passo * 12;
  const total = a * 12 + (m - 1) + meses;
  const a2 = Math.floor(total / 12);
  const m2 = (total % 12) + 1;
  return isoUtc(a2, m2, Math.min(d, ultimoDiaDoMes(a2, m2)));
}

const _mesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const _mesLongo = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
const _diaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const diaSemanaCurto = (iso: string) => {
  const p = partesIso(iso);
  return p ? _diaSemana.format(new Date(Date.UTC(p[0], p[1] - 1, p[2]))).replace(".", "") : "";
};

/** "28/09 a 04/10/2026" (o ano uma vez) ou, na virada do ano, "29/12/2025 a 04/01/2026". */
const textoSemana = (de: string, ate: string) => (de.slice(0, 4) === ate.slice(0, 4) ? `${dataBR(de).slice(0, 5)} a ${dataBR(ate)}` : `${dataBR(de)} a ${dataBR(ate)}`);

/** O rótulo da janela à vista: "Tudo na Mesa", "2026", "Setembro de 2026", "Esta semana, 28/09 a 04/10" (outra semana:
 * "21/09 a 27/09/2026"), "Hoje, 28/09/2026". */
export function rotuloPeriodo(periodo: PeriodoMetricas, ref: string, hoje: string): string {
  const p = partesIso(ref);
  const s = semanaDoDia(ref);
  if (periodo === "tudo" || !p || !s) return "Tudo na Mesa";
  if (periodo === "ano") return String(p[0]);
  if (periodo === "mes") return maiuscula(_mesAno.format(new Date(Date.UTC(p[0], p[1] - 1, 1))));
  if (periodo === "semana") return noPeriodo(hoje, "semana", ref) ? `Esta semana, ${dataBR(s[0]).slice(0, 5)} a ${dataBR(s[1]).slice(0, 5)}` : textoSemana(s[0], s[1]);
  return ref === hoje ? `Hoje, ${dataBR(ref)}` : dataBR(ref);
}

/** A janela numa FRASE ("Os protocolados …"): "na Mesa", "em 2026", "em setembro de 2026", "na semana de 28/09 a
 * 04/10/2026", "em 28/09/2026". */
export function frasePeriodo(periodo: PeriodoMetricas, ref: string): string {
  const p = partesIso(ref);
  const s = semanaDoDia(ref);
  if (periodo === "tudo" || !p || !s) return "na Mesa";
  if (periodo === "ano") return `em ${p[0]}`;
  if (periodo === "mes") return `em ${_mesAno.format(new Date(Date.UTC(p[0], p[1] - 1, 1)))}`;
  if (periodo === "semana") return `na semana de ${textoSemana(s[0], s[1])}`;
  return `em ${dataBR(ref)}`;
}

/** As colunas das tabelas por período (rótulo curto no cabeçalho + o título completo na dica). */
export function colunasMetricas(ref: string, hoje: string): { chave: PeriodoMetricas; rotulo: string; titulo: string }[] {
  const p = partesIso(ref) ?? partesIso(hoje) ?? [1970, 1, 1];
  const [a, m] = p;
  const [seg, dom] = semanaDoDia(ref) ?? semanaDoDia(hoje) ?? [ref, ref];
  return [
    { chave: "dia", rotulo: ref === hoje ? "Hoje" : dataBR(ref).slice(0, 5), titulo: `Protocolados em ${dataBR(ref)}` },
    {
      chave: "semana",
      rotulo: noPeriodo(hoje, "semana", ref) ? "Semana" : `Sem. ${dataBR(seg).slice(0, 5)}`,
      titulo: `Protocolados na semana de ${dataBR(seg)} a ${dataBR(dom)}`,
    },
    { chave: "mes", rotulo: mesLabel(m, a), titulo: `Protocolados em ${_mesAno.format(new Date(Date.UTC(a, m - 1, 1)))}` },
    { chave: "ano", rotulo: String(a), titulo: `Protocolados em ${a}` },
    { chave: "tudo", rotulo: "Na Mesa", titulo: "Todos os protocolos na Mesa agora" },
  ];
}

// ---------------------------------------------------------------------------
// Natureza, pessoa e totais dos DFDs de cada protocolo.
// ---------------------------------------------------------------------------

export type Natureza = { rotulo: string; ordem: number; ano: number | null };
/** Natureza do protocolo: a categoria FIXA do assunto (ou OUTROS) + o ano do PCA — "INCLUSÃO 2027". */
export function naturezaDoProtocolo(assunto: string | null | undefined, anoPca: number | null | undefined): Natureza {
  const chave = classificarAssunto(assunto);
  const i = chave ? CATEGORIAS.findIndex((c) => c.key === chave) : -1;
  const base = i >= 0 ? CATEGORIAS[i].label : "OUTROS";
  const ano = typeof anoPca === "number" && Number.isInteger(anoPca) ? anoPca : null;
  return { rotulo: ano != null ? `${base} ${ano}` : base, ordem: i >= 0 ? i : CATEGORIAS.length, ano };
}
const compararNatureza = (a: Natureza, b: Natureza) => a.ordem - b.ordem || (b.ano ?? -1) - (a.ano ?? -1);

/** As naturezas presentes (a ordem das categorias; o ano mais novo primeiro) — as opções do filtro. */
export function opcoesNatureza(protocolos: readonly Pick<ProtocoloPainel, "assunto" | "anoPca">[]): string[] {
  const m = new Map<string, Natureza>();
  for (const p of protocolos) {
    const n = naturezaDoProtocolo(p.assunto, p.anoPca);
    m.set(n.rotulo, n);
  }
  return [...m.values()].sort(compararNatureza).map((n) => n.rotulo);
}

/** A pessoa do protocolo na dimensão escolhida (`null` = sem responsável / sem registro de quem protocolou). */
export const pessoaDoProtocolo = (p: ProtocoloPainel, pessoa: PessoaMetricas): number | null =>
  pessoa === "distribuicao" ? (p.distribuidorId ?? null) : p.responsavelId;
/** Chave da pessoa nas linhas (o id, ou "sem"). */
export const chavePessoa = (id: number | null) => (id != null ? String(id) : "sem");

/** O protocolo está no FOCO? Uma pessoa, no PAPEL escolhido (Responsável = responde por ele; Distribuição = protocolou);
 * "sem" = sem responsável (em qualquer papel); "todos" = todos. */
export function noFoco(p: ProtocoloPainel, foco: FocoMetricas, pessoa: PessoaMetricas): boolean {
  if (foco === "todos") return true;
  if (foco === "sem") return p.responsavelId == null;
  return pessoaDoProtocolo(p, pessoa) === foco;
}

export type Totais = { dfds: number; itens: number; valor: number };
export type IndiceProtocolo = { total: Totais; porTipo: Map<TipoDfdMetricas, Totais> };
const numero = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const totaisVazios = (): Totais => ({ dfds: 0, itens: 0, valor: 0 });
/** Tipo curto do DFD para as métricas ("Sem tipo" quando o formulário não traz). */
export const tipoDfdMetricas = (tipo: string | null | undefined): TipoDfdMetricas => (tipoCurtoDfd(tipo) as TipoDfdMetricas | null) ?? "sem";

/** DFDs, itens e valor de cada protocolo (todos e por tipo), a partir dos DFDs da Mesa. */
export function indicePorProtocolo(dfds: readonly DfdPainel[]): Map<number, IndiceProtocolo> {
  const m = new Map<number, IndiceProtocolo>();
  for (const d of dfds) {
    if (d.protocoloId == null) continue;
    const idx = m.get(d.protocoloId) ?? { total: totaisVazios(), porTipo: new Map() };
    const tipo = tipoDfdMetricas(d.tipo);
    const t = idx.porTipo.get(tipo) ?? totaisVazios();
    for (const alvo of [idx.total, t]) {
      alvo.dfds++;
      alvo.itens += numero(d.itens);
      alvo.valor += numero(d.valor);
    }
    idx.porTipo.set(tipo, t);
    m.set(d.protocoloId, idx);
  }
  return m;
}

const valorDaMedida = (t: Totais, medida: MedidaMetricas) =>
  medida === "protocolos" ? 1 : medida === "dfds" ? t.dfds : medida === "itens" ? t.itens : t.valor;

// ---------------------------------------------------------------------------
// O RECORTE: a fonte única de todos os quadros.
// ---------------------------------------------------------------------------

export type RecorteMetricas<P extends ProtocoloPainel> = {
  filtro: FiltroMetricas;
  hoje: string;
  foco: FocoMetricas;
  indice: Map<number, IndiceProtocolo>;
  /** Protocolos que passam na natureza, no tipo e no foco (sem o período) — as colunas Dia/Semana/Mês/Ano/Na Mesa. */
  base: P[];
  /** A base no PERÍODO escolhido (pela protocolação) — os quadros da Mesa e o desempenho. */
  coorte: P[];
  /** Dia (Brasília) da protocolação de cada protocolo da base (preso a hoje — a MESMA régua do Dashboard). */
  dia: Map<number, string | null>;
  porId: Map<number, P>;
  /** O histórico de execução (todas as datas — o período vale por métrica): os REENVIOS dos protocolos da base e as AÇÕES
   * de todo o recorte de natureza/tipo (a execução da pessoa não depende do foco); `null` = carregando ou indisponível. */
  atividades: Atividade[] | null;
};

/**
 * O recorte sobre o UNIVERSO das métricas (a Mesa com o Assunto do topo): natureza e tipo da barra + o FOCO (o
 * Responsável do topo, no papel escolhido). Com o foco numa pessoa, cada número é o MESMO da linha dela na visão da
 * equipe.
 */
export function recorteMetricas<P extends ProtocoloPainel>(
  protocolos: readonly P[],
  dfds: readonly DfdPainel[],
  atividades: readonly Atividade[] | null,
  filtro: FiltroMetricas,
  hoje: string,
  foco: FocoMetricas = "todos",
): RecorteMetricas<P> {
  const indice = indicePorProtocolo(dfds);
  const doRecorte = protocolos.filter(
    (p) =>
      (filtro.natureza == null || naturezaDoProtocolo(p.assunto, p.anoPca).rotulo === filtro.natureza) &&
      (filtro.tipo == null || indice.get(p.id)?.porTipo.has(filtro.tipo) === true),
  );
  const base = foco === "todos" ? doRecorte : doRecorte.filter((p) => noFoco(p, foco, filtro.pessoa));
  const dia = new Map<number, string | null>();
  for (const p of base) {
    const d = diaDoProtocolo(p.criadoEm);
    dia.set(p.id, d != null && d > hoje ? hoje : d);
  }
  const porId = new Map(base.map((p) => [p.id, p]));
  const comAcoes: { has(id: number): boolean } = foco === "todos" ? porId : new Set(doRecorte.map((p) => p.id));
  return {
    filtro,
    hoje,
    foco,
    indice,
    base,
    coorte: base.filter((p) => noPeriodo(dia.get(p.id), filtro.periodo, filtro.ref)),
    dia,
    porId,
    atividades: atividades ? atividades.filter((a) => (a.tipo === "reenvio" ? porId : comAcoes).has(a.protocoloId)) : null,
  };
}

/** DFDs/itens/valor do protocolo no recorte (só os do tipo filtrado, quando há). */
export function totaisNoRecorte(rec: RecorteMetricas<ProtocoloPainel>, id: number): Totais {
  const idx = rec.indice.get(id);
  if (!idx) return totaisVazios();
  return rec.filtro.tipo == null ? idx.total : (idx.porTipo.get(rec.filtro.tipo) ?? totaisVazios());
}
/** O valor do protocolo na MEDIDA escolhida (protocolos = 1). */
export const medidaNoRecorte = (rec: RecorteMetricas<ProtocoloPainel>, id: number) => valorDaMedida(totaisNoRecorte(rec, id), rec.filtro.medida);

/** Os DFDs do recorte para os quadros da Mesa (valor por unidade). Sem período, natureza/tipo nem foco = TODOS (o
 * Dashboard de sempre, inclusive os DFDs sem protocolo); senão, os DFDs dos protocolos da coorte (do tipo filtrado) — e,
 * no foco "sem" sem período nem natureza/tipo, também os sem protocolo (como a lista da visão DFDs). */
export function dfdsDoRecorteMetricas<D extends DfdPainel>(dfds: readonly D[], rec: RecorteMetricas<ProtocoloPainel>): D[] {
  const livre = rec.filtro.periodo === "tudo" && !recorteFiltrado(rec.filtro);
  if (livre && rec.foco === "todos") return [...dfds];
  const ids = new Set(rec.coorte.map((p) => p.id));
  const avulsos = livre && rec.foco === "sem";
  return dfds.filter((d) =>
    d.protocoloId == null ? avulsos : ids.has(d.protocoloId) && (rec.filtro.tipo == null || tipoDfdMetricas(d.tipo) === rec.filtro.tipo),
  );
}

// ---------------------------------------------------------------------------
// TABELAS por período (a planilha): pessoa, natureza ou tipo × Dia | Mês | Ano | Na Mesa.
// ---------------------------------------------------------------------------

export type AgrupamentoMetricas = "pessoa" | "natureza" | "tipo";
export type LinhaMetricas = { chave: string; rotulo: string; pessoaId: number | null; valores: Valores };
export type TabelaMetricas = {
  linhas: LinhaMetricas[];
  total: Valores;
  /** Os REENVIOS (correções) em cada janela — pessoa e natureza; `null` enquanto o histórico carrega (e no tipo). */
  correcoes: Valores | null;
};
const zeros = (): Valores => ({ dia: 0, semana: 0, mes: 0, ano: 0, tudo: 0 });

type Contribuicao = { chave: string; rotulo: string; pessoaId: number | null; ordem: number; valor: number };
const ORDEM_TIPO = new Map<string, number>([...TIPOS_DFD_METRICAS.map((t, i) => [t, i] as [string, number]), [CHAVE_SEM_DFDS, TIPOS_DFD_METRICAS.length]]);

/** Em que linha(s) o protocolo entra e com quanto (na medida escolhida). */
function contribuicoes(p: ProtocoloPainel, rec: RecorteMetricas<ProtocoloPainel>, ag: AgrupamentoMetricas): Contribuicao[] {
  if (ag === "pessoa") {
    const id = pessoaDoProtocolo(p, rec.filtro.pessoa);
    return [{ chave: id != null ? String(id) : "sem", rotulo: "", pessoaId: id, ordem: 0, valor: medidaNoRecorte(rec, p.id) }];
  }
  if (ag === "natureza") {
    const n = naturezaDoProtocolo(p.assunto, p.anoPca);
    return [{ chave: n.rotulo, rotulo: n.rotulo, pessoaId: null, ordem: n.ordem * 10_000 - (n.ano ?? 0), valor: medidaNoRecorte(rec, p.id) }];
  }
  const idx = rec.indice.get(p.id);
  if (!idx || idx.total.dfds === 0)
    return [{ chave: CHAVE_SEM_DFDS, rotulo: "Sem DFDs", pessoaId: null, ordem: ORDEM_TIPO.get(CHAVE_SEM_DFDS) ?? 99, valor: rec.filtro.medida === "protocolos" ? 1 : 0 }];
  const out: Contribuicao[] = [];
  for (const [tipo, t] of idx.porTipo) {
    if (rec.filtro.tipo != null && tipo !== rec.filtro.tipo) continue;
    out.push({ chave: tipo, rotulo: ROTULO_TIPO_METRICAS[tipo], pessoaId: null, ordem: ORDEM_TIPO.get(tipo) ?? 98, valor: valorDaMedida(t, rec.filtro.medida) });
  }
  return out;
}
/** O valor do protocolo na linha TOTAL (no tipo com a medida Protocolos, o protocolo conta UMA vez). */
const valorTotal = (cs: Contribuicao[], ag: AgrupamentoMetricas, rec: RecorteMetricas<ProtocoloPainel>) =>
  ag === "tipo" && rec.filtro.medida === "protocolos" ? (cs.length > 0 ? 1 : 0) : cs.reduce((s, c) => s + c.valor, 0);

export function tabelaMetricas(rec: RecorteMetricas<ProtocoloPainel>, ag: AgrupamentoMetricas): TabelaMetricas {
  const linhas = new Map<string, LinhaMetricas & { ordem: number }>();
  const total = zeros();
  for (const p of rec.base) {
    const dia = rec.dia.get(p.id) ?? null;
    const cols = COLUNAS_METRICAS.filter((c) => noPeriodo(dia, c, rec.filtro.ref));
    const cs = contribuicoes(p, rec, ag);
    for (const c of cs) {
      const l = linhas.get(c.chave) ?? { chave: c.chave, rotulo: c.rotulo, pessoaId: c.pessoaId, ordem: c.ordem, valores: zeros() };
      for (const col of cols) l.valores[col] += c.valor;
      linhas.set(c.chave, l);
    }
    const vt = valorTotal(cs, ag, rec);
    for (const col of cols) total[col] += vt;
  }
  const destaque = rec.filtro.periodo;
  const lista = [...linhas.values()].filter((l) => COLUNAS_METRICAS.some((c) => l.valores[c] !== 0));
  lista.sort((a, b) => {
    if (ag !== "pessoa") return a.ordem - b.ordem || a.rotulo.localeCompare(b.rotulo, "pt-BR");
    if ((a.pessoaId == null) !== (b.pessoaId == null)) return a.pessoaId == null ? 1 : -1;
    return b.valores[destaque] - a.valores[destaque] || b.valores.tudo - a.valores.tudo || (a.pessoaId ?? 0) - (b.pessoaId ?? 0);
  });
  return {
    linhas: lista.map(({ ordem: _o, ...l }) => l),
    total,
    correcoes: ag === "tipo" ? null : correcoesPorColuna(rec),
  };
}

/** Os REENVIOS em cada janela (pela data do reenvio): na medida escolhida, cada reenvio conta o processo de novo. */
export function correcoesPorColuna(rec: RecorteMetricas<ProtocoloPainel>): Valores | null {
  if (!rec.atividades) return null;
  const v = zeros();
  for (const a of rec.atividades) {
    if (a.tipo !== "reenvio") continue;
    const val = a.n * medidaNoRecorte(rec, a.protocoloId);
    for (const col of COLUNAS_METRICAS) if (noPeriodo(a.dia, col, rec.filtro.ref)) v[col] += val;
  }
  return v;
}

export type OrigemMetricas<P> = { protocolo: P; valor: number };
/** Na medida Protocolos todo protocolo da célula entra; nas demais, só os que somam algo (DFD sem valor não polui). */
const contaNaOrigem = (rec: RecorteMetricas<ProtocoloPainel>, valor: number) => rec.filtro.medida === "protocolos" || valor !== 0;
/** Os protocolos que formam uma célula (`chave` null = a linha TOTAL) — a soma de `valor` = o número da célula. */
export function origemDaCelula<P extends ProtocoloPainel>(
  rec: RecorteMetricas<P>,
  ag: AgrupamentoMetricas,
  chave: string | null,
  coluna: PeriodoMetricas,
): OrigemMetricas<P>[] {
  const out: OrigemMetricas<P>[] = [];
  for (const p of rec.base) {
    if (!noPeriodo(rec.dia.get(p.id) ?? null, coluna, rec.filtro.ref)) continue;
    const cs = contribuicoes(p, rec, ag);
    const naLinha = chave == null ? cs : cs.filter((c) => c.chave === chave);
    if (naLinha.length === 0) continue;
    const valor = chave == null ? valorTotal(cs, ag, rec) : naLinha.reduce((s, c) => s + c.valor, 0);
    if (contaNaOrigem(rec, valor)) out.push({ protocolo: p, valor });
  }
  return out;
}

export type CorrecaoOrigem<P> = { protocolo: P; dia: string; usuarioId: number | null; n: number; valor: number };
/** Os reenvios de uma janela (opcionalmente só os dos protocolos de UMA pessoa) — Σ `valor` = a célula. */
export function origemCorrecoes<P extends ProtocoloPainel>(rec: RecorteMetricas<P>, coluna: PeriodoMetricas, pessoaChave?: string): CorrecaoOrigem<P>[] {
  if (!rec.atividades) return [];
  const out: CorrecaoOrigem<P>[] = [];
  for (const a of rec.atividades) {
    if (a.tipo !== "reenvio" || !noPeriodo(a.dia, coluna, rec.filtro.ref)) continue;
    const p = rec.porId.get(a.protocoloId);
    if (!p) continue;
    if (pessoaChave != null && chavePessoa(pessoaDoProtocolo(p, rec.filtro.pessoa)) !== pessoaChave) continue;
    out.push({ protocolo: p, dia: a.dia, usuarioId: a.usuarioId, n: a.n, valor: a.n * medidaNoRecorte(rec, p.id) });
  }
  return out.sort((a, b) => b.dia.localeCompare(a.dia));
}

// ---------------------------------------------------------------------------
// EVOLUÇÃO: Tudo = 12 semanas · Ano = meses · Mês = dias · Semana e Dia = os dias da semana.
// ---------------------------------------------------------------------------

export type BaldeMetricas = { chave: string; rotulo: string; dica: string; de: string; ate: string; atual: boolean };

export function baldesEvolucao(periodo: PeriodoMetricas, ref: string, hoje: string): BaldeMetricas[] {
  const nHoje = numDia(hoje) ?? 0;
  const p = partesIso(ref) ?? partesIso(hoje) ?? [1970, 1, 1];
  if (periodo === "tudo") {
    const atual = segunda(nHoje);
    return Array.from({ length: SEMANAS_PAINEL }, (_, i) => {
      const ini = atual - 7 * (SEMANAS_PAINEL - 1 - i);
      const de = isoDoNum(ini);
      const ate = isoDoNum(ini + 6);
      return { chave: de, rotulo: dataBR(de).slice(0, 5), dica: `Semana de ${dataBR(de).slice(0, 5)} a ${dataBR(ate).slice(0, 5)}`, de, ate, atual: ini === atual };
    });
  }
  if (periodo === "ano") {
    const a = p[0];
    return Array.from({ length: 12 }, (_, i) => {
      const de = isoUtc(a, i + 1, 1);
      const ate = isoUtc(a, i + 1, ultimoDiaDoMes(a, i + 1));
      const mesNome = _mesLongo.format(new Date(Date.UTC(a, i, 1)));
      return { chave: de.slice(0, 7), rotulo: mesLabel(i + 1), dica: `${maiuscula(mesNome)} de ${a}`, de, ate, atual: hoje.slice(0, 7) === de.slice(0, 7) };
    });
  }
  if (periodo === "mes") {
    const [a, m] = p;
    return Array.from({ length: ultimoDiaDoMes(a, m) }, (_, i) => {
      const iso = isoUtc(a, m, i + 1);
      return { chave: iso, rotulo: String(i + 1), dica: `${maiuscula(diaSemanaCurto(iso))}, ${dataBR(iso)}`, de: iso, ate: iso, atual: iso === hoje };
    });
  }
  // Semana e Dia: os 7 dias da semana (segunda → domingo); no Dia, o escolhido fica cheio; na Semana, hoje.
  const ini = segunda(numDia(ref) ?? nHoje);
  const cheio = periodo === "dia" ? ref : hoje;
  return Array.from({ length: 7 }, (_, i) => {
    const iso = isoDoNum(ini + i);
    return { chave: iso, rotulo: `${diaSemanaCurto(iso)} ${iso.slice(8)}`, dica: `${maiuscula(diaSemanaCurto(iso))}, ${dataBR(iso)}`, de: iso, ate: iso, atual: iso === cheio };
  });
}

/** O valor de cada balde (na medida escolhida) — Σ = os protocolos da base protocolados nos baldes. */
export function evolucaoMetricas(rec: RecorteMetricas<ProtocoloPainel>, baldes: readonly BaldeMetricas[]): number[] {
  const v = baldes.map(() => 0);
  for (const p of rec.base) {
    const d = rec.dia.get(p.id);
    if (!d) continue;
    const i = baldes.findIndex((b) => d >= b.de && d <= b.ate);
    if (i >= 0) v[i] += medidaNoRecorte(rec, p.id);
  }
  return v;
}
/** Os protocolos de UM balde da evolução — Σ `valor` = a coluna. */
export function origemDoBalde<P extends ProtocoloPainel>(rec: RecorteMetricas<P>, balde: BaldeMetricas): OrigemMetricas<P>[] {
  return rec.base
    .filter((p) => {
      const d = rec.dia.get(p.id);
      return !!d && d >= balde.de && d <= balde.ate;
    })
    .map((p) => ({ protocolo: p, valor: medidaNoRecorte(rec, p.id) }))
    .filter((o) => contaNaOrigem(rec, o.valor));
}

// ---------------------------------------------------------------------------
// DESEMPENHO POR PESSOA (governança: como cada usuário está se saindo).
// ---------------------------------------------------------------------------

export type LinhaDesempenho = {
  chave: string;
  pessoaId: number | null;
  /** Protocolos da pessoa no período (pela protocolação) e os totais dos DFDs deles. */
  protocolos: number;
  dfds: number;
  itens: number;
  valor: number;
  /** Conferidos = com o estado agregado já calculado (regular/atenção/erro). */
  conferidos: number;
  regulares: number;
  atencao: number;
  erro: number;
  /** DFDs com erro/atenção nos protocolos dela (a conferência agregada). */
  dfdsErro: number;
  dfdsAtencao: number;
  /** Tempo na Mesa (dias desde a protocolação): média e quantos passam de `DIAS_ALERTA`. */
  diasMedio: number | null;
  acimaAlerta: number;
  /** Reenvios dos protocolos dela no período (pela data do reenvio) — `null` enquanto o histórico carrega. */
  correcoes: number | null;
  /** Ações de execução FEITAS por ela no período (em todo o recorte de natureza/tipo) — `null` enquanto carrega. */
  acoes: number | null;
};

/**
 * De quem as AÇÕES contam (o desempenho e o resumo — a MESMA régua): na visão da equipe, de todos (`null`); com o foco
 * numa pessoa, só dela; no foco "sem", só de quem já tem linha (dono de protocolo da coorte ou de reenvio no período) —
 * nunca uma linha feita só das ações de terceiros.
 */
function atoresContados(rec: RecorteMetricas<ProtocoloPainel>): Set<number> | null {
  if (rec.foco === "todos") return null;
  if (typeof rec.foco === "number") return new Set([rec.foco]);
  const s = new Set<number>();
  for (const p of rec.coorte) {
    const id = pessoaDoProtocolo(p, rec.filtro.pessoa);
    if (id != null) s.add(id);
  }
  for (const a of rec.atividades ?? []) {
    if (a.tipo !== "reenvio" || !noPeriodo(a.dia, rec.filtro.periodo, rec.filtro.ref)) continue;
    const p = rec.porId.get(a.protocoloId);
    const id = p ? pessoaDoProtocolo(p, rec.filtro.pessoa) : null;
    if (id != null) s.add(id);
  }
  return s;
}

export function desempenhoPorPessoa(rec: RecorteMetricas<ProtocoloPainel>): LinhaDesempenho[] {
  const nHoje = numDia(rec.hoje) ?? 0;
  const atores = atoresContados(rec);
  const linhas = new Map<string, LinhaDesempenho & { somaDias: number; comData: number }>();
  const linha = (id: number | null) => {
    const k = chavePessoa(id);
    let l = linhas.get(k);
    if (!l) {
      l = {
        chave: k,
        pessoaId: id,
        protocolos: 0,
        dfds: 0,
        itens: 0,
        valor: 0,
        conferidos: 0,
        regulares: 0,
        atencao: 0,
        erro: 0,
        dfdsErro: 0,
        dfdsAtencao: 0,
        diasMedio: null,
        acimaAlerta: 0,
        correcoes: rec.atividades ? 0 : null,
        acoes: rec.atividades ? 0 : null,
        somaDias: 0,
        comData: 0,
      };
      linhas.set(k, l);
    }
    return l;
  };
  for (const p of rec.coorte) {
    const l = linha(pessoaDoProtocolo(p, rec.filtro.pessoa));
    const t = totaisNoRecorte(rec, p.id);
    l.protocolos++;
    l.dfds += t.dfds;
    l.itens += t.itens;
    l.valor += t.valor;
    if (p.estado === "regular" || p.estado === "atencao" || p.estado === "erro") {
      l.conferidos++;
      if (p.estado === "regular") l.regulares++;
      else if (p.estado === "atencao") l.atencao++;
      else l.erro++;
    }
    l.dfdsErro += numero(p.dfdsErro);
    l.dfdsAtencao += numero(p.dfdsAtencao);
    const d = rec.dia.get(p.id);
    const n = d ? numDia(d) : null;
    if (n == null) continue;
    const dias = Math.max(0, nHoje - n);
    l.somaDias += dias;
    l.comData++;
    if (dias > DIAS_ALERTA) l.acimaAlerta++;
  }
  for (const a of rec.atividades ?? []) {
    if (!noPeriodo(a.dia, rec.filtro.periodo, rec.filtro.ref)) continue;
    if (a.tipo === "reenvio") {
      const p = rec.porId.get(a.protocoloId);
      if (p) {
        const l = linha(pessoaDoProtocolo(p, rec.filtro.pessoa));
        l.correcoes = (l.correcoes ?? 0) + a.n;
      }
    } else if (a.usuarioId != null && (atores == null || atores.has(a.usuarioId))) {
      const l = linha(a.usuarioId);
      l.acoes = (l.acoes ?? 0) + a.n;
    }
  }
  return [...linhas.values()]
    .map(({ somaDias, comData, ...l }) => ({ ...l, diasMedio: comData > 0 ? somaDias / comData : null }))
    .sort((a, b) => {
      if ((a.pessoaId == null) !== (b.pessoaId == null)) return a.pessoaId == null ? 1 : -1;
      return b.protocolos - a.protocolos || (b.acoes ?? 0) - (a.acoes ?? 0) || (a.pessoaId ?? 0) - (b.pessoaId ?? 0);
    });
}

/** Os protocolos de uma pessoa no período (a origem da linha do desempenho). */
export function protocolosDaPessoa<P extends ProtocoloPainel>(rec: RecorteMetricas<P>, chave: string): OrigemMetricas<P>[] {
  return rec.coorte
    .filter((p) => chavePessoa(pessoaDoProtocolo(p, rec.filtro.pessoa)) === chave)
    .map((p) => ({ protocolo: p, valor: medidaNoRecorte(rec, p.id) }));
}

// ---------------------------------------------------------------------------
// Carga por pessoa × SITUAÇÃO (o alternador Estado | Situação do quadro Carga).
// ---------------------------------------------------------------------------

/** Quantos protocolos da coorte cada pessoa tem em cada situação (a apagada/desconhecida = sem situação, `null`). */
export function situacoesPorPessoa(
  coorte: readonly ProtocoloPainel[],
  pessoa: PessoaMetricas,
  situacoes: readonly number[],
): Map<number | null, Map<number | null, number>> {
  const conhecidas = new Set(situacoes);
  const m = new Map<number | null, Map<number | null, number>>();
  for (const p of coorte) {
    const id = pessoaDoProtocolo(p, pessoa);
    const sit = p.situacaoId != null && conhecidas.has(p.situacaoId) ? p.situacaoId : null;
    const porSit = m.get(id) ?? new Map<number | null, number>();
    porSit.set(sit, (porSit.get(sit) ?? 0) + 1);
    m.set(id, porSit);
  }
  return m;
}

// ---------------------------------------------------------------------------
// RESUMO do recorte (a linha abaixo da barra).
// ---------------------------------------------------------------------------

export type ResumoMetricas = {
  protocolos: number;
  dfds: number;
  itens: number;
  valor: number;
  /** Reenvios no período e quantos protocolos eles tocaram; ações de execução (Σ das linhas do desempenho) — `null`
   * enquanto o histórico carrega (as ações também quando o recorte não tem pessoa: o foco "sem" pelo Responsável). */
  correcoes: number | null;
  corrigidos: number | null;
  acoes: number | null;
};
export function resumoMetricas(rec: RecorteMetricas<ProtocoloPainel>): ResumoMetricas {
  const r: ResumoMetricas = { protocolos: rec.coorte.length, dfds: 0, itens: 0, valor: 0, correcoes: null, corrigidos: null, acoes: null };
  for (const p of rec.coorte) {
    const t = totaisNoRecorte(rec, p.id);
    r.dfds += t.dfds;
    r.itens += t.itens;
    r.valor += t.valor;
  }
  if (rec.atividades) {
    const atores = atoresContados(rec);
    let correcoes = 0;
    let acoes = 0;
    const corrigidos = new Set<number>();
    for (const a of rec.atividades) {
      if (!noPeriodo(a.dia, rec.filtro.periodo, rec.filtro.ref)) continue;
      if (a.tipo === "reenvio") {
        correcoes += a.n;
        corrigidos.add(a.protocoloId);
      } else if (a.usuarioId != null && (atores == null || atores.has(a.usuarioId))) acoes += a.n; // a MESMA régua do desempenho
    }
    Object.assign(r, { correcoes, corrigidos: corrigidos.size, acoes: atores != null && atores.size === 0 ? null : acoes });
  }
  return r;
}
