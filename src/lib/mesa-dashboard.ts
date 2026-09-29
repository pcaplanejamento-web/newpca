import { ESTADO_PROTOCOLO_ROTULO } from "./dfd-tratamento.ts";
import { dataIsoBrasilia } from "./format.ts";

/**
 * DASHBOARD DE GOVERNANÇA da Mesa — os KPIs (a Mesa AGORA), PUROS/testáveis, sobre as MESMAS listas que a Mesa já
 * carregou (protocolos e DFDs, já filtrados pela hierarquia Responsável/Assunto): nenhuma consulta nova ao banco. O
 * ESTADO de cada protocolo é o AGREGADO da conferência da Mesa (capa + DFDs + itens, pelas regras do ADM) — até ele
 * chegar, "conferindo". Datas em dias de CALENDÁRIO de Brasília (a mesma régua da coluna Data da Mesa). O gráfico e o
 * desempenho por pessoa (a barra de métricas) ficam em `mesa-metricas`.
 */

/** Estado de governança de um protocolo: o agregado da conferência ou, até ela chegar, "conferindo" (falha =
 * "naoConferido" — nunca um "Regular" falso). */
export type EstadoPainel = "regular" | "atencao" | "erro" | "conferindo" | "naoConferido";
/** Ordem de exibição: da melhor situação à pendente. */
export const ESTADOS_PAINEL: readonly EstadoPainel[] = ["regular", "atencao", "erro", "conferindo", "naoConferido"];
/** O nome de cada estado (os da conferência + os de espera). */
export const ROTULO_ESTADO_PAINEL: Record<EstadoPainel, string> = {
  regular: ESTADO_PROTOCOLO_ROTULO.regular,
  atencao: ESTADO_PROTOCOLO_ROTULO.atencao,
  erro: ESTADO_PROTOCOLO_ROTULO.erro,
  conferindo: "Conferindo…",
  naoConferido: "Não conferido",
};

/** Protocolo como o Dashboard o vê (a GESTÃO — responsável/situação — já com a edição otimista da célula). */
export type ProtocoloPainel = {
  id: number;
  /** Identificação na ORIGEM dos dados (a lista de um número tocado). */
  numero?: string;
  assunto?: string | null;
  /** Data da PROTOCOLAÇÃO (timestamp UTC do banco). */
  criadoEm: string | null;
  responsavelId: number | null;
  situacaoId: number | null;
  estado: EstadoPainel;
  /** Para as MÉTRICAS (`mesa-metricas`): quem protocolou (a Distribuição), o ano do PCA (a natureza) e os DFDs com
   * erro/atenção da conferência agregada (`null` enquanto confere). */
  distribuidorId?: number | null;
  anoPca?: number | null;
  dfdsErro?: number | null;
  dfdsAtencao?: number | null;
};
/** DFD como o Dashboard o vê: a unidade requisitante (id + sigla + nome — a sigla pode repetir entre órgãos), os totais,
 * o protocolo (`null` = avulso) e o tipo (DFD-S/R/O/E). */
export type DfdPainel = {
  unidadeId: number | null;
  unidade: string | null;
  unidadeNome: string | null;
  valor: number | null;
  itens: number | null;
  protocoloId?: number | null;
  tipo?: string | null;
};

/** Semanas da linha do KPI de protocolos (a atual incluída — parcial). */
export const SEMANAS_PAINEL = 7;
/** Protocolos acima deste tempo na Mesa entram no alerta do KPI. */
export const DIAS_ALERTA = 30;
/** Faixas do tempo na Mesa (dias de calendário desde a protocolação). */
export const FAIXAS_IDADE: readonly { ate: number; rotulo: string; curto: string }[] = [
  { ate: 7, rotulo: "Até 7 dias", curto: "0–7" },
  { ate: 15, rotulo: "8 a 15 dias", curto: "8–15" },
  { ate: 30, rotulo: "16 a 30 dias", curto: "16–30" },
  { ate: 60, rotulo: "31 a 60 dias", curto: "31–60" },
  { ate: 90, rotulo: "61 a 90 dias", curto: "61–90" },
  { ate: Number.POSITIVE_INFINITY, rotulo: "Mais de 90 dias", curto: "90+" },
];

/** Os KPIs da Mesa agora. */
export type PainelMesa = {
  protocolos: number;
  dfds: number;
  itens: number;
  /** Σ dos DFDs em escopo. */
  valor: number;
  semResponsavel: number;
  /** Tempo na Mesa (dias desde a protocolação): a média — `null` sem datas. */
  diasMedio: number | null;
  /** Protocolos há mais de `DIAS_ALERTA` dias na Mesa. */
  acimaAlerta: number;
  /** Quantos protocolos em cada estado agregado. */
  saude: Record<EstadoPainel, number>;
  /** Protocolos por semana (domingo a sábado — a semana do seletor de período) nas últimas `SEMANAS_PAINEL`, a mais antiga
   * primeiro (a atual por último). */
  semanas: number[];
};

const DIA_MS = 86_400_000;
const valorSeguro = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Nº do dia (desde 1970-01-01) de uma data ISO "AAAA-MM-DD"; `null` se inválida. */
function diaDaData(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DIA_MS) : null;
}
/** Dia de CALENDÁRIO em Brasília de um timestamp do banco (UTC). */
const diaBrasilia = (ts: string | null | undefined) => (ts ? diaDaData(dataIsoBrasilia(ts)) : null);
/** Domingo da semana do dia (1970-01-01 foi uma quinta) — a semana do seletor de período. */
const inicioSemana = (dia: number) => dia - ((((dia + 4) % 7) + 7) % 7);

/**
 * Os KPIs do Dashboard da Mesa; `agora` é injetado (testável). Protocolo sem data não entra no tempo na Mesa nem na
 * linha semanal; data futura (relógio adiantado) conta como hoje.
 */
export function painelMesa(entrada: { protocolos: readonly ProtocoloPainel[]; dfds: readonly DfdPainel[] }, agora: Date): PainelMesa {
  const { protocolos, dfds } = entrada;
  const hoje = diaBrasilia(agora.toISOString()) ?? Math.floor(agora.getTime() / DIA_MS);
  const semanaAtual = inicioSemana(hoje);
  const saude = Object.fromEntries(ESTADOS_PAINEL.map((e) => [e, 0])) as Record<EstadoPainel, number>;
  const semanas: number[] = Array.from({ length: SEMANAS_PAINEL }, () => 0);
  let semResponsavel = 0;
  let somaDias = 0;
  let comData = 0;
  let acimaAlerta = 0;
  for (const p of protocolos) {
    saude[p.estado]++;
    if (p.responsavelId == null) semResponsavel++;
    const dia = diaBrasilia(p.criadoEm);
    if (dia == null) continue;
    const dias = Math.max(0, hoje - dia);
    somaDias += dias;
    comData++;
    if (dias > DIAS_ALERTA) acimaAlerta++;
    const k = (semanaAtual - inicioSemana(Math.min(dia, hoje))) / 7;
    if (k >= 0 && k < SEMANAS_PAINEL) semanas[SEMANAS_PAINEL - 1 - k]++;
  }
  let itens = 0;
  let valor = 0;
  for (const d of dfds) {
    itens += valorSeguro(d.itens);
    valor += valorSeguro(d.valor);
  }
  return {
    protocolos: protocolos.length,
    dfds: dfds.length,
    itens,
    valor,
    semResponsavel,
    diasMedio: comData > 0 ? somaDias / comData : null,
    acimaAlerta,
    saude,
    semanas,
  };
}
