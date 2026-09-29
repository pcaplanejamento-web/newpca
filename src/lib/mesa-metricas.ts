import { CATEGORIAS, classificarAssunto } from "./avaliacao-core.ts";
import { dataBR, dataIsoBrasilia, mesLabel } from "./format.ts";
import { DIAS_ALERTA, type DfdPainel, ESTADOS_PAINEL, FAIXAS_IDADE, type ProtocoloPainel, ROTULO_ESTADO_PAINEL } from "./mesa-dashboard.ts";
import { tipoCurtoDfd } from "./parse-dfd-comum.ts";
import { noIntervalo, PERIODO_TODO, type Periodo, textoIntervalo } from "./periodo.ts";
import type { IntervaloData } from "./tabela-filtros.ts";

/**
 * MÉTRICAS DE GOVERNANÇA da Mesa (a barra abaixo das KPIs do Dashboard) — PURAS/testáveis, SÓ sobre a execução da
 * Mesa: os protocolos e DFDs que ela já carregou + o HISTÓRICO de execução deles (`/api/mesa/execucao`: reenvios e
 * ações). Nada de fora da Mesa (PCA, orçamento, tarefas, calendário).
 *
 * - PERÍODO = o seletor de período do sistema (`@/lib/periodo`): os protocolos pela data da PROTOCOLAÇÃO (dia de
 *   Brasília); correções e ações pela data do EVENTO no histórico. Sem limites = a Mesa inteira (inclusive sem data).
 * - UM GRÁFICO: o DADO (as barras) × a MEDIDA (o tamanho). A pessoa (Responsável ou Quem protocolou) segue o Dado; nos
 *   demais, o Responsável. As AÇÕES são de quem as fez (nos Dados de pessoa, as barras são de quem executou).
 * - FOCO = o Responsável do topo da Mesa: numa pessoa, só essa pessoa, no papel — a MESMA linha da pessoa na visão da
 *   equipe. As ações de cada pessoa contam em toda a Mesa (nunca dependem desse filtro).
 * - NATUREZA = a categoria do assunto (INCLUSÃO/EXCLUSÃO/ALTERAÇÃO NÃO ONEROSA, senão OUTROS) + o ano do PCA.
 * - CORREÇÃO = o REENVIO do protocolo (o processo devolvido volta corrigido).
 * - Toda barra/linha tem a sua ORIGEM: a soma da lista = o número tocado (as MESMAS contas).
 */

// ---------------------------------------------------------------------------
// O que a barra escolhe.
// ---------------------------------------------------------------------------

export type DadoMetricas = "responsavel" | "distribuicao" | "natureza" | "tipo" | "situacao" | "estado" | "unidade" | "tempo" | "data";
export const DADOS_METRICAS: readonly { value: DadoMetricas; label: string }[] = [
  { value: "responsavel", label: "Responsável" },
  { value: "distribuicao", label: "Quem protocolou" },
  { value: "natureza", label: "Natureza" },
  { value: "tipo", label: "Tipo de DFD" },
  { value: "situacao", label: "Situação" },
  { value: "estado", label: "Estado" },
  { value: "unidade", label: "Unidade" },
  { value: "tempo", label: "Tempo na Mesa" },
  { value: "data", label: "Data" },
];

export type MedidaMetricas = "protocolos" | "dfds" | "itens" | "valor" | "correcoes" | "acoes";
/** `um`/`varios` = o número por extenso ("1 correção", "3 ações"); o valor vai em R$. */
export const MEDIDAS_METRICAS: readonly { value: MedidaMetricas; label: string; um: string; varios: string }[] = [
  { value: "protocolos", label: "Protocolos", um: "protocolo", varios: "protocolos" },
  { value: "dfds", label: "DFDs", um: "DFD", varios: "DFDs" },
  { value: "itens", label: "Itens", um: "item", varios: "itens" },
  { value: "valor", label: "Valor", um: "", varios: "" },
  { value: "correcoes", label: "Correções", um: "correção", varios: "correções" },
  { value: "acoes", label: "Ações", um: "ação", varios: "ações" },
];
/** Medidas que vêm do histórico (um evento = um reenvio ou uma ação). */
export const medidaDeEvento = (m: MedidaMetricas) => m === "correcoes" || m === "acoes";

/** Quem é "a pessoa" do protocolo: o Responsável ou quem protocolou (a Distribuição). */
export type PessoaMetricas = "responsavel" | "distribuicao";
/** O PAPEL segue o Dado: "Quem protocolou" → a Distribuição; os demais → o Responsável. */
export const papelDoDado = (dado: DadoMetricas): PessoaMetricas => (dado === "distribuicao" ? "distribuicao" : "responsavel");

export type FiltroMetricas = { periodo: Periodo; dado: DadoMetricas; medida: MedidaMetricas };
/** A barra como abre: todo o período, protocolos por responsável. */
export const FILTRO_METRICAS_PADRAO: FiltroMetricas = { periodo: PERIODO_TODO, dado: "responsavel", medida: "protocolos" };

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
/** Domingo da semana do dia (1970-01-01 foi uma quinta) — a semana do seletor de período (domingo a sábado). */
const domingo = (n: number) => n - ((((n + 4) % 7) + 7) % 7);
const _mesLongo = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
const _diaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const diaSemanaCurto = (iso: string) => {
  const p = partesIso(iso);
  return p ? _diaSemana.format(new Date(Date.UTC(p[0], p[1] - 1, p[2]))).replace(".", "") : "";
};

/** Dia (Brasília) da protocolação — `null` sem data. */
export const diaDoProtocolo = (criadoEm: string | null | undefined): string | null => dataIsoBrasilia(criadoEm) || null;

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

/** A pessoa do protocolo no papel (`null` = sem responsável / sem registro de quem protocolou). */
export const pessoaDoProtocolo = (p: ProtocoloPainel, papel: PessoaMetricas): number | null =>
  papel === "distribuicao" ? (p.distribuidorId ?? null) : p.responsavelId;
/** Chave da pessoa nas linhas (o id, ou "sem"). */
export const chavePessoa = (id: number | null) => (id != null ? String(id) : "sem");

/** O protocolo está no FOCO? Uma pessoa, no PAPEL (Responsável = responde por ele; Distribuição = protocolou); "sem" =
 * sem responsável (em qualquer papel); "todos" = todos. */
export function noFoco(p: ProtocoloPainel, foco: FocoMetricas, papel: PessoaMetricas): boolean {
  if (foco === "todos") return true;
  if (foco === "sem") return p.responsavelId == null;
  return pessoaDoProtocolo(p, papel) === foco;
}

type TipoDfd = "DFD-S" | "DFD-R" | "DFD-O" | "DFD-E" | "sem";
const TIPOS_DFD: readonly TipoDfd[] = ["DFD-S", "DFD-R", "DFD-O", "DFD-E", "sem"];
const ROTULO_TIPO: Record<TipoDfd, string> = { "DFD-S": "DFD-S", "DFD-R": "DFD-R", "DFD-O": "DFD-O", "DFD-E": "DFD-E", sem: "Sem tipo" };
const tipoDoDfd = (tipo: string | null | undefined): TipoDfd => (tipoCurtoDfd(tipo) as TipoDfd | null) ?? "sem";

export type Totais = { dfds: number; itens: number; valor: number };
type TotaisUnidade = Totais & { sigla: string; nome: string | null };
type IndiceProtocolo = { total: Totais; porTipo: Map<TipoDfd, Totais>; porUnidade: Map<string, TotaisUnidade> };
const SEM_TOTAIS: Readonly<Totais> = Object.freeze({ dfds: 0, itens: 0, valor: 0 });
const numero = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
/** Chaves das linhas "sem" (o grupo não existe no protocolo). */
const CHAVE_SEM_DFDS = "sem-dfds";
const CHAVE_SEM_UNIDADE = "sem-unidade";
/** A linha que junta a cauda (as pessoas/unidades além das `MAX_LINHAS_GRAFICO` maiores). */
export const CHAVE_OUTRAS = "outras";
/** Barras listadas nos Dados ordenados pelo valor (pessoas e unidades); o resto vira "Outras N". */
export const MAX_LINHAS_GRAFICO = 10;

/** DFDs, itens e valor de cada protocolo (todos, por tipo e por unidade), a partir dos DFDs da Mesa. */
function indicePorProtocolo(dfds: readonly DfdPainel[]): Map<number, IndiceProtocolo> {
  const m = new Map<number, IndiceProtocolo>();
  for (const d of dfds) {
    if (d.protocoloId == null) continue;
    const idx = m.get(d.protocoloId) ?? { total: { dfds: 0, itens: 0, valor: 0 }, porTipo: new Map(), porUnidade: new Map() };
    const tipo = tipoDoDfd(d.tipo);
    const t = idx.porTipo.get(tipo) ?? { dfds: 0, itens: 0, valor: 0 };
    const chaveU = d.unidadeId != null ? String(d.unidadeId) : CHAVE_SEM_UNIDADE;
    const u = idx.porUnidade.get(chaveU) ?? { dfds: 0, itens: 0, valor: 0, sigla: d.unidadeId != null ? (d.unidade ?? "").trim() : "", nome: null };
    u.nome ??= d.unidadeNome?.trim() || null;
    for (const alvo of [idx.total, t, u]) {
      alvo.dfds++;
      alvo.itens += numero(d.itens);
      alvo.valor += numero(d.valor);
    }
    idx.porTipo.set(tipo, t);
    idx.porUnidade.set(chaveU, u);
    m.set(d.protocoloId, idx);
  }
  return m;
}
const medidaDosTotais = (t: Totais, medida: MedidaMetricas) =>
  medida === "dfds" ? t.dfds : medida === "itens" ? t.itens : medida === "valor" ? t.valor : 1;

// ---------------------------------------------------------------------------
// O RECORTE: a fonte única do gráfico, do desempenho e do resumo.
// ---------------------------------------------------------------------------

export type RecorteMetricas<P extends ProtocoloPainel> = {
  hoje: string;
  foco: FocoMetricas;
  papel: PessoaMetricas;
  /** O período em dias ({} = sem limites). */
  intervalo: IntervaloData;
  indice: Map<number, IndiceProtocolo>;
  /** Todos os protocolos do UNIVERSO (a Mesa com o Assunto do topo) — as ações contam em qualquer um deles. */
  universo: Map<number, P>;
  /** Os do FOCO (sem o período) e o mapa deles. */
  base: P[];
  porId: Map<number, P>;
  /** A base protocolada no período (sem limites = toda a base, inclusive os sem data). */
  coorte: P[];
  /** Dia (Brasília) da protocolação de cada protocolo do universo (a data futura conta como hoje). */
  dia: Map<number, string | null>;
  /** No período, pela data do evento: os reenvios dos protocolos da base e as ações de quem conta (nunca de ator
   * removido) — `null` enquanto o histórico carrega ou se falhou. */
  reenvios: Atividade[] | null;
  acoes: Atividade[] | null;
  /** Foco "sem" sem ninguém no recorte: as ações não se aplicam (não há de quem contar). */
  semAtores: boolean;
};

/**
 * De quem as AÇÕES contam (o gráfico, o desempenho e o resumo — a MESMA régua): na visão da equipe, de todos (`null`);
 * com o foco numa pessoa, só dela; no foco "sem", só de quem já tem linha (dono de protocolo da coorte ou de reenvio no
 * período) — nunca uma linha feita só das ações de terceiros.
 */
function atoresContados<P extends ProtocoloPainel>(foco: FocoMetricas, papel: PessoaMetricas, coorte: readonly P[], reenvios: readonly Atividade[], porId: Map<number, P>): Set<number> | null {
  if (foco === "todos") return null;
  if (typeof foco === "number") return new Set([foco]);
  const s = new Set<number>();
  for (const p of coorte) {
    const id = pessoaDoProtocolo(p, papel);
    if (id != null) s.add(id);
  }
  for (const a of reenvios) {
    const p = porId.get(a.protocoloId);
    const id = p ? pessoaDoProtocolo(p, papel) : null;
    if (id != null) s.add(id);
  }
  return s;
}

/**
 * O recorte sobre o UNIVERSO das métricas (a Mesa com o Assunto do topo): o período (em dias — `intervaloDoPeriodo`) +
 * o FOCO (o Responsável do topo, no papel do Dado). Independe do Dado e da Medida (trocar um deles só refaz o gráfico).
 * Com o foco numa pessoa, cada número é o MESMO da linha da pessoa na visão da equipe.
 */
export function recorteMetricas<P extends ProtocoloPainel>(
  protocolos: readonly P[],
  dfds: readonly DfdPainel[],
  atividades: readonly Atividade[] | null,
  o: { intervalo: IntervaloData; papel: PessoaMetricas; hoje: string; foco?: FocoMetricas },
): RecorteMetricas<P> {
  const { intervalo, papel, hoje, foco = "todos" } = o;
  const universo = new Map(protocolos.map((p) => [p.id, p]));
  const dia = new Map<number, string | null>();
  for (const p of protocolos) {
    const d = diaDoProtocolo(p.criadoEm);
    dia.set(p.id, d != null && d > hoje ? hoje : d);
  }
  const base = foco === "todos" ? [...protocolos] : protocolos.filter((p) => noFoco(p, foco, papel));
  const porId = foco === "todos" ? universo : new Map(base.map((p) => [p.id, p]));
  const coorte = base.filter((p) => noIntervalo(dia.get(p.id), intervalo));
  let reenvios: Atividade[] | null = null;
  let acoes: Atividade[] | null = null;
  let semAtores = false;
  if (atividades) {
    const r = atividades.filter((a) => a.tipo === "reenvio" && porId.has(a.protocoloId) && noIntervalo(a.dia, intervalo));
    const atores = atoresContados(foco, papel, coorte, r, porId);
    semAtores = atores != null && atores.size === 0;
    reenvios = r;
    acoes = atividades.filter(
      (a) => a.tipo === "acao" && a.usuarioId != null && (atores == null || atores.has(a.usuarioId)) && universo.has(a.protocoloId) && noIntervalo(a.dia, intervalo),
    );
  }
  return { hoje, foco, papel, intervalo, indice: indicePorProtocolo(dfds), universo, base, porId, coorte, dia, reenvios, acoes, semAtores };
}

const totaisDoProtocolo = (rec: RecorteMetricas<ProtocoloPainel>, id: number): Totais => rec.indice.get(id)?.total ?? SEM_TOTAIS;

/** Os anos com protocolação no foco + o de hoje, do mais novo ao mais antigo — os anos do seletor de período. */
export function anosComDados(rec: RecorteMetricas<ProtocoloPainel>): number[] {
  const s = new Set<number>([Number(rec.hoje.slice(0, 4))]);
  for (const p of rec.base) {
    const d = rec.dia.get(p.id);
    if (d) s.add(Number(d.slice(0, 4)));
  }
  return [...s].filter((a) => Number.isInteger(a) && a > 999).sort((a, b) => b - a);
}

// ---------------------------------------------------------------------------
// Dado "Data": os baldes pelo tamanho do período.
// ---------------------------------------------------------------------------

export type GranularidadeData = "dia" | "semana" | "mes" | "ano";
export type BaldeData = { chave: string; rotulo: string; titulo: string; de: string; ate: string; atual: boolean };

/**
 * Os baldes de [de, ate] (dias AAAA-MM-DD): até 31 dias = dias; até 14 semanas (98 dias) = semanas de domingo a
 * sábado, cortadas nas pontas; até 36 meses = meses; acima = anos — nunca colunas demais para o celular. `atual` = o que
 * contém hoje; `chaveDoDia` põe um dia no balde dele por CONTA (sem varrer os baldes) — `null` fora de [de, ate].
 */
export function baldesData(de: string, ate: string, hoje: string): { granularidade: GranularidadeData; baldes: BaldeData[]; chaveDoDia: (dia: string) => string | null } {
  const n0 = numDia(de) ?? 0;
  const n1 = Math.max(n0, numDia(ate) ?? n0);
  const inicio = isoDoNum(n0);
  const fim = isoDoNum(n1);
  const [a0, m0] = partesIso(inicio) ?? [1970, 1, 1];
  const [a1, m1] = partesIso(fim) ?? [1970, 1, 1];
  const dentro = (d: string) => d >= inicio && d <= fim;
  const balde = (chave: string, rotulo: string, titulo: string, bDe: string, bAte: string): BaldeData => ({
    chave,
    rotulo,
    titulo,
    de: bDe < inicio ? inicio : bDe,
    ate: bAte > fim ? fim : bAte,
    atual: hoje >= (bDe < inicio ? inicio : bDe) && hoje <= (bAte > fim ? fim : bAte),
  });
  const dias = n1 - n0 + 1;
  const meses = (a1 - a0) * 12 + (m1 - m0) + 1;
  if (dias <= 31) {
    const baldes = Array.from({ length: dias }, (_, i) => {
      const iso = isoDoNum(n0 + i);
      const rotulo = dias <= 7 ? `${diaSemanaCurto(iso)} ${iso.slice(8)}` : String(Number(iso.slice(8)));
      return balde(iso, rotulo, `${maiuscula(diaSemanaCurto(iso))}, ${dataBR(iso)}`, iso, iso);
    });
    return { granularidade: "dia", baldes, chaveDoDia: (d) => (dentro(d) ? d : null) };
  }
  if (dias <= 14 * 7) {
    const baldes: BaldeData[] = [];
    for (let s = n0; s <= n1; ) {
      const e = Math.min(n1, domingo(s) + 6);
      const bDe = isoDoNum(s);
      const bAte = isoDoNum(e);
      baldes.push(balde(bDe, dataBR(bDe).slice(0, 5), `Semana de ${textoIntervalo({ de: bDe, ate: bAte })}`, bDe, bAte));
      s = e + 1;
    }
    return {
      granularidade: "semana",
      baldes,
      chaveDoDia: (d) => {
        const n = numDia(d);
        return n == null || !dentro(d) ? null : isoDoNum(Math.max(n0, domingo(n)));
      },
    };
  }
  if (meses <= 36) {
    const baldes = Array.from({ length: meses }, (_, k) => {
      const a = a0 + Math.floor((m0 - 1 + k) / 12);
      const m = ((m0 - 1 + k) % 12) + 1;
      const bDe = isoUtc(a, m, 1);
      const titulo = `${maiuscula(_mesLongo.format(new Date(Date.UTC(a, m - 1, 1))))} de ${a}`;
      return balde(bDe.slice(0, 7), a0 === a1 ? mesLabel(m) : mesLabel(m, a), titulo, bDe, isoUtc(a, m + 1, 0));
    });
    return { granularidade: "mes", baldes, chaveDoDia: (d) => (dentro(d) ? d.slice(0, 7) : null) };
  }
  const baldes = Array.from({ length: a1 - a0 + 1 }, (_, i) => {
    const a = String(a0 + i);
    return balde(a, a, a, `${a}-01-01`, `${a}-12-31`);
  });
  return { granularidade: "ano", baldes, chaveDoDia: (d) => (dentro(d) ? d.slice(0, 4) : null) };
}

// ---------------------------------------------------------------------------
// O GRÁFICO ÚNICO: Dado × Medida, com a origem de cada barra pelo MESMO caminho.
// ---------------------------------------------------------------------------

export type LinhaGrafico = {
  chave: string;
  /** O que a barra é (texto curto; nos Dados de pessoa a tela mostra a foto + o apelido de `pessoaId`). */
  rotulo: string;
  /** Nome completo (dica e nome acessível). */
  titulo: string;
  valor: number;
  /** Dados de pessoa: a pessoa da barra (`null` = sem pessoa). */
  pessoaId?: number | null;
  /** Agregado ("Outras N…") ou "Sem …" — esmaecida. */
  apagada?: boolean;
  /** Dado "Data": o balde que contém hoje. */
  atual?: boolean;
};
export type OrigemMetricas<P> = { protocolo: P; valor: number };
export type EventoOrigem<P> = { protocolo: P; dia: string; usuarioId: number | null; n: number };
/** A origem de uma ou mais barras: os protocolos (com o valor de cada um na medida) ou os eventos (reenvios/ações). */
export type OrigemGrafico<P> = { tipo: "protocolos"; lista: OrigemMetricas<P>[] } | { tipo: "eventos"; evento: TipoAtividade; lista: EventoOrigem<P>[] };
export type GraficoMetricas<P> = {
  linhas: LinhaGrafico[];
  /** O que o gráfico soma (protocolos/eventos contados UMA vez mesmo quando caem em mais de uma barra). */
  total: number;
  /** O que ficou FORA do gráfico (Dado Data: os protocolos sem data de protocolação) — na mesma medida. */
  fora: number;
  /** Tipo de DFD/Unidade: um protocolo (ou evento) contou em mais de uma barra — a soma das barras passa do total. */
  repete: boolean;
  /** Dado "Data": o passo dos baldes. */
  granularidade: GranularidadeData | null;
  /** A origem das barras de `chaves` (Σ = o número delas; "outras" = a cauda). */
  origem: (chaves: readonly string[]) => OrigemGrafico<P>;
};

type Grupo = { chave: string; rotulo: string; titulo: string; ordem: number; pessoaId?: number | null; totais: Readonly<Totais> };
type Lancamento<P> = { chave: string; id: number; valor: number; protocolo: P; evento: Atividade | null };

const CHAVE_SEM_DATA = "sem-data";
/** As barras "sem" (sem pessoa, situação, tipo, unidade, DFDs ou data) ficam esmaecidas, como a "Outras N". */
const CHAVES_APAGADAS = new Set(["sem", CHAVE_SEM_DFDS, CHAVE_SEM_UNIDADE, CHAVE_SEM_DATA]);
const grupoSemDfds = (totais: Readonly<Totais>): Grupo => ({ chave: CHAVE_SEM_DFDS, rotulo: "Sem DFDs", titulo: "Protocolos sem DFDs", ordem: 2, totais });
function grupoPessoa(id: number | null, sem: string, totais: Readonly<Totais>): Grupo {
  return id == null
    ? { chave: "sem", rotulo: sem, titulo: sem, ordem: 1, pessoaId: null, totais }
    : { chave: String(id), rotulo: `Pessoa #${id}`, titulo: `Pessoa #${id}`, ordem: 0, pessoaId: id, totais };
}
/** Dados de pessoa e unidade: as barras vão pelo VALOR (as maiores primeiro) e a cauda vira "Outras N". */
const porValor = (dado: DadoMetricas) => dado === "responsavel" || dado === "distribuicao" || dado === "unidade";

/** Os grupos (barras) de um protocolo no Dado — Tipo e Unidade pelos DFDs dele (um protocolo pode cair em vários). */
function gruposDoProtocolo(rec: RecorteMetricas<ProtocoloPainel>, p: ProtocoloPainel, dado: DadoMetricas, situacoes: Map<number, string>, nHoje: number): Grupo[] {
  const idx = rec.indice.get(p.id);
  const total = idx?.total ?? SEM_TOTAIS;
  switch (dado) {
    case "responsavel":
    case "distribuicao":
      return [grupoPessoa(pessoaDoProtocolo(p, rec.papel), rec.papel === "distribuicao" ? "Sem registro de quem protocolou" : "Sem responsável", total)];
    case "natureza": {
      const n = naturezaDoProtocolo(p.assunto, p.anoPca);
      return [{ chave: n.rotulo, rotulo: n.rotulo, titulo: n.rotulo, ordem: n.ordem * 10_000 - (n.ano ?? 0), totais: total }];
    }
    case "tipo":
      if (!idx || idx.total.dfds === 0) return [grupoSemDfds(total)];
      return [...idx.porTipo].map(([t, tot]) => ({ chave: t, rotulo: ROTULO_TIPO[t], titulo: ROTULO_TIPO[t], ordem: 1, totais: tot }));
    case "unidade":
      if (!idx || idx.total.dfds === 0) return [grupoSemDfds(total)];
      return [...idx.porUnidade].map(([k, u]) => {
        const rotulo = k === CHAVE_SEM_UNIDADE ? "Sem unidade" : u.sigla || u.nome || `Unidade #${k}`;
        return { chave: k, rotulo, titulo: u.nome && u.nome !== rotulo ? `${rotulo} — ${u.nome}` : rotulo, ordem: k === CHAVE_SEM_UNIDADE ? 1 : 0, totais: u };
      });
    case "situacao": {
      const nome = p.situacaoId != null ? situacoes.get(p.situacaoId) : undefined;
      return [nome != null ? { chave: String(p.situacaoId), rotulo: nome, titulo: nome, ordem: 0, totais: total } : { chave: "sem", rotulo: "Sem situação", titulo: "Sem situação", ordem: 1, totais: total }];
    }
    case "estado":
      return [{ chave: p.estado, rotulo: ROTULO_ESTADO_PAINEL[p.estado], titulo: ROTULO_ESTADO_PAINEL[p.estado], ordem: ESTADOS_PAINEL.indexOf(p.estado), totais: total }];
    case "tempo": {
      const d = rec.dia.get(p.id);
      const n = d ? numDia(d) : null;
      if (n == null) return [{ chave: CHAVE_SEM_DATA, rotulo: "Sem data", titulo: "Sem data de protocolação", ordem: 1, totais: total }];
      const f = FAIXAS_IDADE[FAIXAS_IDADE.findIndex((x) => Math.max(0, nHoje - n) <= x.ate)];
      return [{ chave: f.curto, rotulo: f.rotulo, titulo: f.rotulo, ordem: 0, totais: total }];
    }
    default:
      return [];
  }
}

/** As barras FIXAS de cada Dado de domínio fechado (aparecem mesmo zeradas, na ordem dele). */
function barrasFixas(dado: DadoMetricas, situacoes: readonly { id: number; nome: string }[]): Grupo[] | null {
  const g = (chave: string, rotulo: string): Grupo => ({ chave, rotulo, titulo: rotulo, ordem: 0, totais: SEM_TOTAIS });
  if (dado === "tipo") return TIPOS_DFD.filter((t) => t !== "sem").map((t) => g(t, ROTULO_TIPO[t]));
  if (dado === "situacao") return situacoes.map((s) => g(String(s.id), s.nome));
  if (dado === "estado") return (["regular", "atencao", "erro"] as const).map((e) => g(e, ROTULO_ESTADO_PAINEL[e]));
  if (dado === "tempo") return FAIXAS_IDADE.map((f) => g(f.curto, f.rotulo));
  return null;
}

/**
 * O GRÁFICO da barra de métricas: as barras do Dado na Medida, de UMA lista de lançamentos {chave, identidade, valor}
 * — a mesma que forma a ORIGEM de cada barra (Σ = o número). Medidas de protocolo percorrem a coorte; Correções, os
 * reenvios; Ações, as ações (nos Dados de pessoa, por QUEM FEZ). Tipo de DFD e Unidade vêm dos DFDs do protocolo:
 * DFDs/itens/valor se dividem entre os grupos; protocolos, correções e ações contam uma vez em cada grupo e uma vez em
 * "Outras" e no total. Domínios fechados (tipo, situação, estado, tempo) mostram as barras deles mesmo zeradas e, depois,
 * as "Sem …" que houver; os abertos, só as que têm valor. `situacoes` = as cadastradas pelo ADM, na ordem dele.
 */
export function graficoMetricas<P extends ProtocoloPainel>(
  rec: RecorteMetricas<P>,
  dado: DadoMetricas,
  medida: MedidaMetricas,
  situacoes: readonly { id: number; nome: string }[],
): GraficoMetricas<P> {
  const evento = medidaDeEvento(medida);
  const particiona = medida === "dfds" || medida === "itens" || medida === "valor";
  const nHoje = numDia(rec.hoje) ?? 0;
  const nomeSituacao = new Map(situacoes.map((s) => [s.id, s.nome]));
  const eventos = (medida === "correcoes" ? rec.reenvios : medida === "acoes" ? rec.acoes : null) ?? [];
  const deProtocolo = (a: Atividade) => (medida === "correcoes" ? rec.porId : rec.universo).get(a.protocoloId);

  // Dado "Data": os baldes sobre o período (sem início, do 1º dia com dado; sem fim, até hoje).
  let data: ReturnType<typeof baldesData> | null = null;
  if (dado === "data") {
    let de = rec.intervalo.de;
    let ate = rec.intervalo.ate;
    const considerar = (d: string | null | undefined) => {
      if (!d) return;
      if (!rec.intervalo.de && (de == null || d < de)) de = d;
      if (!rec.intervalo.ate && (ate == null || d > ate)) ate = d;
    };
    if (evento) for (const a of eventos) considerar(a.dia);
    else for (const p of rec.coorte) considerar(rec.dia.get(p.id));
    if (!rec.intervalo.ate && de != null && (ate == null || rec.hoje > ate)) ate = rec.hoje;
    de ??= ate;
    if (de && ate) data = baldesData(de, ate < de ? de : ate, rec.hoje);
  }
  const doDia = (dia: string | null | undefined, totais: Readonly<Totais>): Grupo[] => {
    const chave = dia && data ? data.chaveDoDia(dia) : null;
    return chave ? [{ chave, rotulo: chave, titulo: chave, ordem: 0, totais }] : [];
  };

  const grupos = new Map<string, Grupo>();
  const porChave = new Map<string, Lancamento<P>[]>();
  const fora: Lancamento<P>[] = [];
  const lancar = (gs: Grupo[], id: number, protocolo: P, ev: Atividade | null, valorDe: (t: Readonly<Totais>) => number) => {
    if (gs.length === 0) {
      fora.push({ chave: "", id, valor: valorDe(totaisDoProtocolo(rec, protocolo.id)), protocolo, evento: ev });
      return;
    }
    for (const g of gs) {
      if (!grupos.has(g.chave)) grupos.set(g.chave, g);
      const l = porChave.get(g.chave) ?? [];
      l.push({ chave: g.chave, id, valor: valorDe(g.totais), protocolo, evento: ev });
      porChave.set(g.chave, l);
    }
  };
  if (evento) {
    for (const [i, a] of eventos.entries()) {
      const p = deProtocolo(a);
      if (!p) continue;
      const gs =
        dado === "data"
          ? doDia(a.dia, SEM_TOTAIS)
          : medida === "acoes" && (dado === "responsavel" || dado === "distribuicao")
            ? [grupoPessoa(a.usuarioId, "Sem registro", SEM_TOTAIS)]
            : gruposDoProtocolo(rec, p, dado, nomeSituacao, nHoje);
      lancar(gs, i, p, a, () => a.n);
    }
  } else {
    for (const p of rec.coorte) {
      const gs = dado === "data" ? doDia(rec.dia.get(p.id), totaisDoProtocolo(rec, p.id)) : gruposDoProtocolo(rec, p, dado, nomeSituacao, nHoje);
      lancar(gs, p.id, p, null, (t) => medidaDosTotais(t, medida));
    }
  }

  /** Σ na medida: DFDs/itens/valor somam tudo; protocolos e eventos, cada um UMA vez. */
  const somar = (ls: readonly Lancamento<P>[]) => {
    if (particiona) return ls.reduce((s, l) => s + l.valor, 0);
    const vistos = new Map<number, number>();
    for (const l of ls) vistos.set(l.id, l.valor);
    let s = 0;
    for (const v of vistos.values()) s += v;
    return s;
  };
  const linhaDe = (g: Grupo): LinhaGrafico => ({
    chave: g.chave,
    rotulo: g.rotulo,
    titulo: g.titulo,
    valor: somar(porChave.get(g.chave) ?? []),
    ...(g.pessoaId !== undefined ? { pessoaId: g.pessoaId } : {}),
    ...(CHAVES_APAGADAS.has(g.chave) ? { apagada: true } : {}),
  });

  let linhas: LinhaGrafico[];
  let cauda: string[] = [];
  const fixas = barrasFixas(dado, situacoes);
  if (dado === "data") {
    linhas = (data?.baldes ?? []).map((b) => ({ chave: b.chave, rotulo: b.rotulo, titulo: b.titulo, valor: somar(porChave.get(b.chave) ?? []), atual: b.atual }));
  } else if (fixas) {
    // Domínio fechado: as fixas (zeradas também) e, depois, as que sobrarem ("Sem …", conferindo, não conferido) com valor.
    const chavesFixas = new Set(fixas.map((g) => g.chave));
    const extras = [...grupos.values()].filter((g) => !chavesFixas.has(g.chave)).sort((a, b) => a.ordem - b.ordem);
    linhas = [...fixas.map(linhaDe), ...extras.map(linhaDe).filter((l) => l.valor !== 0)];
  } else if (porValor(dado)) {
    const todas = [...grupos.values()].map((g) => ({ g, l: linhaDe(g) })).filter((x) => x.l.valor !== 0);
    const comuns = todas.filter((x) => x.g.ordem === 0).sort((a, b) => b.l.valor - a.l.valor || a.g.chave.localeCompare(b.g.chave, "pt-BR", { numeric: true }));
    const semGrupo = todas.filter((x) => x.g.ordem > 0).sort((a, b) => a.g.ordem - b.g.ordem);
    const mostradas = comuns.length > MAX_LINHAS_GRAFICO + 1 ? comuns.slice(0, MAX_LINHAS_GRAFICO) : comuns;
    cauda = comuns.slice(mostradas.length).map((x) => x.g.chave);
    const nome = `Outras ${cauda.length} ${dado === "unidade" ? "unidades" : "pessoas"}`;
    const outras: LinhaGrafico[] = cauda.length === 0 ? [] : [{ chave: CHAVE_OUTRAS, rotulo: nome, titulo: nome, valor: somar(cauda.flatMap((k) => porChave.get(k) ?? [])), apagada: true }];
    linhas = [...mostradas.map((x) => x.l), ...outras, ...semGrupo.map((x) => x.l)];
  } else {
    // Natureza: a ordem das categorias (o ano mais novo primeiro); só as que têm valor.
    linhas = [...grupos.values()]
      .sort((a, b) => a.ordem - b.ordem || a.rotulo.localeCompare(b.rotulo, "pt-BR"))
      .map(linhaDe)
      .filter((l) => l.valor !== 0);
  }

  const total = somar([...porChave.values()].flat());
  return {
    linhas,
    total,
    fora: somar(fora),
    repete: !particiona && (dado === "tipo" || dado === "unidade") && linhas.reduce((s, l) => s + l.valor, 0) > total,
    granularidade: data?.granularidade ?? null,
    origem: (chaves) => {
      const alvo = new Set(chaves.flatMap((k) => (k === CHAVE_OUTRAS ? cauda : [k])));
      const ls = [...alvo].flatMap((k) => porChave.get(k) ?? []);
      if (evento) {
        const unicos = new Map<number, Lancamento<P>>();
        for (const l of ls) unicos.set(l.id, l);
        const lista = [...unicos.values()]
          .map((l) => ({ protocolo: l.protocolo, dia: l.evento?.dia ?? "", usuarioId: l.evento?.usuarioId ?? null, n: l.evento?.n ?? 0 }))
          .sort((a, b) => b.dia.localeCompare(a.dia));
        return { tipo: "eventos", evento: medida === "correcoes" ? "reenvio" : "acao", lista };
      }
      const porProtocolo = new Map<number, OrigemMetricas<P>>();
      for (const l of ls) {
        const o = porProtocolo.get(l.id);
        if (!o) porProtocolo.set(l.id, { protocolo: l.protocolo, valor: l.valor });
        else if (particiona) o.valor += l.valor;
      }
      return { tipo: "protocolos", lista: [...porProtocolo.values()].filter((o) => medida === "protocolos" || o.valor !== 0) };
    },
  };
}

const POR_DADO: Record<DadoMetricas, string> = {
  responsavel: "responsável",
  distribuicao: "quem protocolou",
  natureza: "natureza",
  tipo: "tipo de DFD",
  situacao: "situação",
  estado: "estado",
  unidade: "unidade",
  tempo: "tempo na Mesa",
  data: "data",
};
const POR_GRANULARIDADE: Record<GranularidadeData, string> = { dia: "dia", semana: "semana", mes: "mês", ano: "ano" };
/** O título do gráfico: "Protocolos por responsável", "Valor por mês", "Ações por quem executou". */
export function tituloGrafico(dado: DadoMetricas, medida: MedidaMetricas, granularidade: GranularidadeData | null): string {
  const m = MEDIDAS_METRICAS.find((x) => x.value === medida)?.label ?? "";
  const por =
    medida === "acoes" && (dado === "responsavel" || dado === "distribuicao")
      ? "quem executou"
      : dado === "data" && granularidade
        ? POR_GRANULARIDADE[granularidade]
        : POR_DADO[dado];
  return `${m} por ${por}`;
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
  /** DFDs com erro/atenção nos protocolos da pessoa (a conferência agregada). */
  dfdsErro: number;
  dfdsAtencao: number;
  /** Tempo na Mesa (dias desde a protocolação): média e quantos passam de `DIAS_ALERTA`. */
  diasMedio: number | null;
  acimaAlerta: number;
  /** Reenvios dos protocolos da pessoa no período (pela data do reenvio) — `null` enquanto o histórico carrega. */
  correcoes: number | null;
  /** Ações de execução FEITAS pela pessoa no período (em toda a Mesa) — `null` enquanto carrega. */
  acoes: number | null;
};

export function desempenhoPorPessoa(rec: RecorteMetricas<ProtocoloPainel>): LinhaDesempenho[] {
  const nHoje = numDia(rec.hoje) ?? 0;
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
        correcoes: rec.reenvios ? 0 : null,
        acoes: rec.acoes ? 0 : null,
        somaDias: 0,
        comData: 0,
      };
      linhas.set(k, l);
    }
    return l;
  };
  for (const p of rec.coorte) {
    const l = linha(pessoaDoProtocolo(p, rec.papel));
    const t = totaisDoProtocolo(rec, p.id);
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
  for (const a of rec.reenvios ?? []) {
    const p = rec.porId.get(a.protocoloId);
    if (!p) continue;
    const l = linha(pessoaDoProtocolo(p, rec.papel));
    l.correcoes = (l.correcoes ?? 0) + a.n;
  }
  for (const a of rec.acoes ?? []) {
    const l = linha(a.usuarioId);
    l.acoes = (l.acoes ?? 0) + a.n;
  }
  return [...linhas.values()]
    .map(({ somaDias, comData, ...l }) => ({ ...l, diasMedio: comData > 0 ? somaDias / comData : null }))
    .sort((a, b) => {
      if ((a.pessoaId == null) !== (b.pessoaId == null)) return a.pessoaId == null ? 1 : -1;
      return b.protocolos - a.protocolos || (b.acoes ?? 0) - (a.acoes ?? 0) || (a.pessoaId ?? 0) - (b.pessoaId ?? 0);
    });
}

/** Os protocolos de uma pessoa no período (a origem da linha do desempenho), com o valor (R$) dos DFDs de cada um — a
 * soma = a coluna Valor da linha. */
export function protocolosDaPessoa<P extends ProtocoloPainel>(rec: RecorteMetricas<P>, chave: string): OrigemMetricas<P>[] {
  return rec.coorte.filter((p) => chavePessoa(pessoaDoProtocolo(p, rec.papel)) === chave).map((p) => ({ protocolo: p, valor: totaisDoProtocolo(rec, p.id).valor }));
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
   * enquanto o histórico carrega (as ações também quando não há de quem contar: o foco "sem" pelo Responsável). */
  correcoes: number | null;
  corrigidos: number | null;
  acoes: number | null;
};
export function resumoMetricas(rec: RecorteMetricas<ProtocoloPainel>): ResumoMetricas {
  const r: ResumoMetricas = { protocolos: rec.coorte.length, dfds: 0, itens: 0, valor: 0, correcoes: null, corrigidos: null, acoes: null };
  for (const p of rec.coorte) {
    const t = totaisDoProtocolo(rec, p.id);
    r.dfds += t.dfds;
    r.itens += t.itens;
    r.valor += t.valor;
  }
  if (rec.reenvios) {
    r.correcoes = rec.reenvios.reduce((s, a) => s + a.n, 0);
    r.corrigidos = new Set(rec.reenvios.map((a) => a.protocoloId)).size;
  }
  if (rec.acoes && !rec.semAtores) r.acoes = rec.acoes.reduce((s, a) => s + a.n, 0);
  return r;
}
