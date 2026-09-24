import { dataIsoBrasilia } from "./format.ts";

/**
 * DASHBOARD DE GOVERNANÇA da Mesa — agregados PUROS (testáveis) sobre as MESMAS listas que a Mesa já carregou
 * (protocolos e DFDs, já filtrados pela hierarquia Responsável/Assunto): nenhuma consulta nova ao banco. O
 * ESTADO de cada protocolo é o AGREGADO da conferência da Mesa (capa + DFDs + itens, pelas regras do ADM) — até
 * ele chegar, "conferindo". Datas em dias de CALENDÁRIO de Brasília (a mesma régua da coluna Data da Mesa).
 */

/** Estado de governança de um protocolo: o agregado da conferência ou, até ela chegar, "conferindo" (falha =
 * "naoConferido" — nunca um "Regular" falso). */
export type EstadoPainel = "regular" | "atencao" | "erro" | "conferindo" | "naoConferido";
/** Ordem de exibição: da melhor situação à pendente. */
export const ESTADOS_PAINEL: readonly EstadoPainel[] = ["regular", "atencao", "erro", "conferindo", "naoConferido"];

/** Protocolo como o Dashboard o vê (a GESTÃO — responsável/situação — já com a edição otimista da célula). */
export type ProtocoloPainel = {
  id: number;
  /** Identificação p/ a ORIGEM dos dados (a lista do recorte clicado). */
  numero?: string;
  assunto?: string | null;
  sigla?: string | null;
  /** Data da PROTOCOLAÇÃO (timestamp UTC do banco). */
  criadoEm: string | null;
  /** Σ dos DFDs do protocolo. */
  valor: number;
  responsavelId: number | null;
  situacaoId: number | null;
  estado: EstadoPainel;
};
/** DFD como o Dashboard o vê: a unidade requisitante (id + sigla + nome — a sigla pode repetir entre órgãos) e os
 * totais. */
export type DfdPainel = {
  unidadeId: number | null;
  unidade: string | null;
  unidadeNome: string | null;
  valor: number | null;
  itens: number | null;
  /** Identificação p/ a ORIGEM dos dados (a lista do recorte clicado). */
  id?: number;
  numero?: string;
  planejamento?: string | null;
};

/** Quantidade + valor (R$) de um recorte. */
export type Fatia = { n: number; valor: number };
export type PorEstado = Record<EstadoPainel, number>;

/** Semanas da série de ENTRADA (a atual incluída — parcial). */
export const SEMANAS_PAINEL = 12;
/** Pessoas listadas na carga por responsável (o resto vira "Outras N pessoas"). */
export const MAX_RESPONSAVEIS = 8;
/** Unidades listadas no valor por unidade (o resto vira "Outras N unidades"). */
export const MAX_UNIDADES = 7;
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

export type PainelMesa = {
  protocolos: number;
  dfds: number;
  itens: number;
  /** Σ dos DFDs em escopo (a MESMA base do valor por unidade). */
  valor: number;
  semResponsavel: number;
  /** Tempo na Mesa (dias desde a protocolação): média e o mais antigo — `null` sem datas. */
  diasMedio: number | null;
  diasMaximo: number | null;
  /** Protocolos há mais de `DIAS_ALERTA` dias na Mesa. */
  acimaAlerta: number;
  saude: Record<EstadoPainel, Fatia>;
  /** Na ORDEM do ADM (todas as cadastradas) + "Sem situação" (`id: null`) no fim, só se houver. */
  situacoes: ({ id: number | null } & Fatia)[];
  /** Mais carregadas primeiro; "Sem responsável" (`id: null`) sempre por último. */
  responsaveis: ({ id: number | null; porEstado: PorEstado } & Fatia)[];
  /** A cauda além de `MAX_RESPONSAVEIS` (pessoas COM responsável). */
  outrosResponsaveis: ({ pessoas: number; porEstado: PorEstado } & Fatia) | null;
  faixasIdade: ({ rotulo: string; curto: string } & Fatia)[];
  /** As últimas `SEMANAS_PAINEL` semanas (segunda a domingo), a mais antiga primeiro; `inicio` = AAAA-MM-DD. */
  semanas: ({ inicio: string; rotulo: string; atual: boolean } & Fatia)[];
  /** Maiores valores primeiro, uma linha por UNIDADE (pelo id — a sigla pode repetir entre órgãos); `chave` "sem" e
   * sigla "" = sem unidade. */
  unidades: { chave: string; sigla: string; nome: string | null; dfds: number; valor: number }[];
  outrasUnidades: { unidades: number; dfds: number; valor: number } | null;
};

const DIA_MS = 86_400_000;
const valorSeguro = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const porEstadoVazio = (): PorEstado => ({ regular: 0, atencao: 0, erro: 0, conferindo: 0, naoConferido: 0 });

/** Nº do dia (desde 1970-01-01) de uma data ISO "AAAA-MM-DD"; `null` se inválida. */
function diaDaData(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DIA_MS) : null;
}
/** Dia de CALENDÁRIO em Brasília de um timestamp do banco (UTC). */
const diaBrasilia = (ts: string | null | undefined) => (ts ? diaDaData(dataIsoBrasilia(ts)) : null);
/** Segunda-feira da semana do dia (1970-01-01 foi uma quinta). */
const inicioSemana = (dia: number) => dia - ((((dia + 3) % 7) + 7) % 7);
const isoDoDia = (dia: number) => new Date(dia * DIA_MS).toISOString().slice(0, 10);
const rotuloDoDia = (dia: number) => {
  const [, m, d] = isoDoDia(dia).split("-");
  return `${d}/${m}`;
};

/**
 * Agrega o Dashboard da Mesa. `situacoes` = os ids cadastrados pelo ADM, na ordem dele; `agora` é injetado
 * (testável). Protocolo sem data não entra no tempo na Mesa nem na série semanal.
 */
export function painelMesa(
  entrada: { protocolos: readonly ProtocoloPainel[]; dfds: readonly DfdPainel[]; situacoes: readonly number[] },
  agora: Date,
): PainelMesa {
  const { protocolos, dfds, situacoes } = entrada;
  const hoje = diaBrasilia(agora.toISOString()) ?? Math.floor(agora.getTime() / DIA_MS);
  const semanaAtual = inicioSemana(hoje);

  const saude = Object.fromEntries(ESTADOS_PAINEL.map((e) => [e, { n: 0, valor: 0 }])) as Record<EstadoPainel, Fatia>;
  const conhecidas = new Set(situacoes);
  const porSituacao = new Map<number | null, Fatia>(situacoes.map((id) => [id, { n: 0, valor: 0 }]));
  const porResp = new Map<number | null, { n: number; valor: number; porEstado: PorEstado }>();
  const faixas = FAIXAS_IDADE.map((f) => ({ rotulo: f.rotulo, curto: f.curto, n: 0, valor: 0 }));
  const semanas = Array.from({ length: SEMANAS_PAINEL }, (_, i) => {
    const inicio = semanaAtual - 7 * (SEMANAS_PAINEL - 1 - i);
    return { inicio: isoDoDia(inicio), rotulo: rotuloDoDia(inicio), atual: i === SEMANAS_PAINEL - 1, n: 0, valor: 0 };
  });

  let semResponsavel = 0;
  let somaDias = 0;
  let comData = 0;
  let diasMaximo: number | null = null;
  let acimaAlerta = 0;
  for (const p of protocolos) {
    const valor = valorSeguro(p.valor);
    const s = saude[p.estado];
    s.n++;
    s.valor += valor;

    // Situação apagada/desconhecida conta como "Sem situação" (a célula mostra assim).
    const sit = p.situacaoId != null && conhecidas.has(p.situacaoId) ? p.situacaoId : null;
    const fs = porSituacao.get(sit) ?? { n: 0, valor: 0 };
    fs.n++;
    fs.valor += valor;
    porSituacao.set(sit, fs);

    if (p.responsavelId == null) semResponsavel++;
    const fr = porResp.get(p.responsavelId) ?? { n: 0, valor: 0, porEstado: porEstadoVazio() };
    fr.n++;
    fr.valor += valor;
    fr.porEstado[p.estado]++;
    porResp.set(p.responsavelId, fr);

    const dia = diaBrasilia(p.criadoEm);
    if (dia == null) continue;
    const dias = Math.max(0, hoje - dia);
    somaDias += dias;
    comData++;
    diasMaximo = Math.max(diasMaximo ?? 0, dias);
    if (dias > DIAS_ALERTA) acimaAlerta++;
    const fx = faixas[FAIXAS_IDADE.findIndex((f) => dias <= f.ate)];
    fx.n++;
    fx.valor += valor;
    const k = (semanaAtual - inicioSemana(Math.min(dia, hoje))) / 7;
    if (k >= 0 && k < SEMANAS_PAINEL) {
      const w = semanas[SEMANAS_PAINEL - 1 - k];
      w.n++;
      w.valor += valor;
    }
  }

  // Responsáveis: mais protocolos primeiro (desempate: valor, depois id — estável); "sem" por último.
  const comPessoa = [...porResp].filter(([id]) => id != null).map(([id, f]) => ({ id, ...f }));
  comPessoa.sort((a, b) => b.n - a.n || b.valor - a.valor || (a.id ?? 0) - (b.id ?? 0));
  const cauda = comPessoa.slice(MAX_RESPONSAVEIS);
  const sem = porResp.get(null);
  const outrosResponsaveis =
    cauda.length === 0
      ? null
      : cauda.reduce(
          (acc, r) => {
            acc.n += r.n;
            acc.valor += r.valor;
            for (const e of ESTADOS_PAINEL) acc.porEstado[e] += r.porEstado[e];
            return acc;
          },
          { pessoas: cauda.length, n: 0, valor: 0, porEstado: porEstadoVazio() },
        );

  // Unidades (pelos DFDs, agrupadas pelo ID): maiores valores primeiro; a cauda vira "Outras".
  const porUnidade = new Map<string, { chave: string; sigla: string; nome: string | null; dfds: number; valor: number }>();
  let itens = 0;
  let valorDfds = 0;
  for (const d of dfds) {
    const v = valorSeguro(d.valor);
    itens += valorSeguro(d.itens);
    valorDfds += v;
    const chave = chaveUnidadePainel(d);
    const u = porUnidade.get(chave) ?? { chave, sigla: d.unidadeId != null ? (d.unidade ?? "").trim() : "", nome: null, dfds: 0, valor: 0 };
    u.nome ??= d.unidadeNome?.trim() || null;
    u.dfds++;
    u.valor += v;
    porUnidade.set(chave, u);
  }
  const unidades = [...porUnidade.values()].sort((a, b) => b.valor - a.valor || b.dfds - a.dfds || a.sigla.localeCompare(b.sigla, "pt-BR"));
  const outras = unidades.slice(MAX_UNIDADES);

  return {
    protocolos: protocolos.length,
    dfds: dfds.length,
    itens,
    valor: valorDfds,
    semResponsavel,
    diasMedio: comData > 0 ? somaDias / comData : null,
    diasMaximo,
    acimaAlerta,
    saude,
    situacoes: [
      ...situacoes.map((id) => ({ id, ...(porSituacao.get(id) ?? { n: 0, valor: 0 }) })),
      ...((porSituacao.get(null)?.n ?? 0) > 0 ? [{ id: null, ...(porSituacao.get(null) as Fatia) }] : []),
    ],
    responsaveis: [...comPessoa.slice(0, MAX_RESPONSAVEIS), ...(sem ? [{ id: null, ...sem }] : [])],
    outrosResponsaveis,
    faixasIdade: faixas,
    semanas,
    unidades: unidades.slice(0, MAX_UNIDADES),
    outrasUnidades:
      outras.length === 0
        ? null
        : { unidades: outras.length, dfds: outras.reduce((s, u) => s + u.dfds, 0), valor: outras.reduce((s, u) => s + u.valor, 0) },
  };
}

// ---------------------------------------------------------------------------
// ORIGEM dos dados — os protocolos/DFDs de um recorte clicado, pelas MESMAS chaves de `painelMesa`.
// ---------------------------------------------------------------------------

export type RecorteMesa =
  | { dim: "estado"; estado: EstadoPainel }
  /** `id: null` = "Sem situação" (inclui situação apagada/desconhecida, como no agregado). */
  | { dim: "situacao"; id: number | null }
  /** Índice em `FAIXAS_IDADE`. */
  | { dim: "idade"; faixa: number }
  /** Início (AAAA-MM-DD) da semana da série de entrada. */
  | { dim: "semana"; inicio: string };

/** Protocolos que formam um recorte do Dashboard da Mesa (`situacoes` = as cadastradas; `agora` injetado). */
export function protocolosDoRecorte<P extends ProtocoloPainel>(
  protocolos: readonly P[],
  r: RecorteMesa,
  situacoes: readonly number[],
  agora: Date,
): P[] {
  if (r.dim === "estado") return protocolos.filter((p) => p.estado === r.estado);
  if (r.dim === "situacao") {
    const conhecidas = new Set(situacoes);
    return protocolos.filter((p) => (p.situacaoId != null && conhecidas.has(p.situacaoId) ? p.situacaoId : null) === r.id);
  }
  const hoje = diaBrasilia(agora.toISOString()) ?? Math.floor(agora.getTime() / DIA_MS);
  if (r.dim === "idade")
    return protocolos.filter((p) => {
      const dia = diaBrasilia(p.criadoEm);
      return dia != null && FAIXAS_IDADE.findIndex((f) => Math.max(0, hoje - dia) <= f.ate) === r.faixa;
    });
  const alvo = diaDaData(r.inicio);
  return protocolos.filter((p) => {
    const dia = diaBrasilia(p.criadoEm);
    return dia != null && alvo != null && inicioSemana(Math.min(dia, hoje)) === alvo;
  });
}

/** Chave da UNIDADE de um DFD no Dashboard (a MESMA do agregado: o id, ou "sem"). */
export const chaveUnidadePainel = (d: DfdPainel) => (d.unidadeId != null ? String(d.unidadeId) : "sem");

/** DFDs das unidades `chaves` — ou, com `fora`, dos que NÃO estão nelas (a linha "Outras N unidades"). */
export function dfdsDoRecorte<D extends DfdPainel>(dfds: readonly D[], chaves: readonly string[], fora = false): D[] {
  const set = new Set(chaves);
  return dfds.filter((d) => set.has(chaveUnidadePainel(d)) !== fora);
}
