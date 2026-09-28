"use client";

import { type ReactNode, useId, useMemo, useState } from "react";
import type { RegrasAvaliacao } from "@/lib/avaliacao-core";
import { ESTADO_PROTOCOLO_ROTULO, estadoProtocoloCor } from "@/lib/dfd-tratamento";
import { brl, brlCompact, dataBR, num, pct } from "@/lib/format";
import {
  DIAS_ALERTA,
  type DfdPainel,
  dfdsDoRecorte,
  ESTADOS_PAINEL,
  type EstadoPainel,
  FAIXAS_IDADE,
  painelMesa,
  type ProtocoloPainel,
  protocolosDoRecorte,
  type RecorteMesa,
} from "@/lib/mesa-dashboard";
import type { FiltroMesa } from "@/lib/mesa-filtros";
import {
  type AgrupamentoMetricas,
  type Atividade,
  baldesEvolucao,
  type CorrecaoOrigem,
  chavePessoa,
  colunasMetricas,
  desempenhoPorPessoa,
  dfdsDoRecorteMetricas,
  diaDoProtocolo,
  evolucaoMetricas,
  type FiltroMetricas,
  frasePeriodo,
  type LinhaDesempenho,
  MEDIDAS_METRICAS,
  type MedidaMetricas,
  naturezaDoProtocolo,
  noFoco,
  type OrigemMetricas,
  opcoesNatureza,
  origemCorrecoes,
  origemDaCelula,
  origemDoBalde,
  type PeriodoMetricas,
  protocolosDaPessoa,
  recorteFiltrado,
  recorteMetricas,
  resumoMetricas,
  rotuloPeriodo,
  situacoesPorPessoa,
  type TabelaMetricas,
  tabelaMetricas,
} from "@/lib/mesa-metricas";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import type { SituacaoCadastrada } from "@/lib/situacoes";
import { Avatar } from "./Avatar";
import type { AberturaMesa } from "./BannersMesa";
import { BarraMetricas } from "./BarraMetricas";
import { Button } from "./Button";
import { ChartCard } from "./ChartCard";
import { BarraSegmentada, BarrasH, Colunas, type LinhaBarra, type Segmento } from "./charts/Barras";
import { ChartEmpty } from "./charts/shared";
import { type Column, DataTable } from "./DataTable";
import { IconInfo, IconUser } from "./icons";
import { KpiStat } from "./KpiStat";
import { OrigemDados } from "./OrigemDados";
import { Segmented } from "./Segmented";
import { type ColunaTabelaPeriodo, type LinhaTabelaPeriodo, TabelaPeriodo } from "./TabelaPeriodo";

const ROTULO_ESTADO: Record<EstadoPainel, string> = {
  regular: ESTADO_PROTOCOLO_ROTULO.regular,
  atencao: ESTADO_PROTOCOLO_ROTULO.atencao,
  erro: ESTADO_PROTOCOLO_ROTULO.erro,
  conferindo: "Conferindo…",
  naoConferido: "Não conferido",
};
/** Rampa ORDINAL do tempo na Mesa: o accent do ADM, do mais claro (recente) ao cheio (mais antigo). */
const RAMPA_IDADE = [45, 56, 67, 78, 89, 100].map((p) => `color-mix(in srgb, var(--accent) ${p}%, var(--surface))`);
/** Colunas da evolução fora da atual (a semana/o mês/o dia de hoje, ou o dia escolhido, fica cheia). */
const COR_BALDE = "color-mix(in srgb, var(--accent) 58%, var(--surface))";
const plural = (n: number, um: string, varios: string) => `${num(n)} ${n === 1 ? um : varios}`;
/** Chaves das linhas especiais das tabelas por período. */
const TOTAL = "__total";
const CORRECOES = "__correcoes";
const rotuloDaMedida = (m: MedidaMetricas) => MEDIDAS_METRICAS.find((x) => x.value === m)?.label ?? "";
const formatarMedida = (m: MedidaMetricas, n: number) => (m === "valor" ? brl(n) : num(n));

/**
 * As MÉTRICAS da barra (o estado mora no `DfdsView` — sobrevive às trocas de visão): o filtro, hoje e o HISTÓRICO de
 * execução (reenvios/ações dos protocolos da Mesa — `null` enquanto carrega ou se falhou).
 */
export type MetricasDashboard = {
  filtro: FiltroMetricas;
  onFiltro: (f: FiltroMetricas) => void;
  /** Hoje (AAAA-MM-DD, Brasília). */
  hoje: string;
  atividades: Atividade[] | null;
  /** O histórico falhou: correções/ações ficam "—" e a linha do recorte oferece "Tentar de novo". */
  erro: boolean;
  onTentar: () => void;
};

/** A ORIGEM aberta: o quadro clicado + os protocolos (ou DFDs, ou reenvios) que formam aquele número. */
type Origem =
  | { quadro: string; rotulo: string; tipo: "protocolos"; lista: ProtocoloPainel[] }
  | { quadro: string; rotulo: string; tipo: "dfds"; lista: DfdPainel[] }
  | { quadro: string; rotulo: string; tipo: "metricas"; medida: MedidaMetricas; lista: OrigemMetricas<ProtocoloPainel>[] }
  | { quadro: string; rotulo: string; tipo: "correcoes"; medida: MedidaMetricas; lista: CorrecaoOrigem<ProtocoloPainel>[] };

const COLS_DFD: Column<DfdPainel>[] = [
  { key: "plan", header: "Nº Plan.", nowrap: true, value: (d) => d.planejamento ?? "—", render: (d) => <span className="font-mono text-[12px]">{d.planejamento ?? "—"}</span> },
  { key: "dfd", header: "Nº DFD", nowrap: true, value: (d) => d.numero ?? "—", render: (d) => <span className="font-mono text-[12px] font-semibold">{d.numero ?? "—"}</span> },
  { key: "sigla", header: "Unidade", nowrap: true, value: (d) => d.unidade ?? "—", render: (d) => <span className="font-mono text-[12px] text-text-2">{d.unidade ?? "—"}</span> },
  { key: "itens", header: "Itens", nowrap: true, filter: "range", numero: (d) => d.itens, render: (d) => num(d.itens ?? 0) },
  { key: "valor", header: "Valor", align: "right", nowrap: true, filter: "range", numero: (d) => d.valor, render: (d) => <span className="font-semibold tabular-nums">{brl(d.valor ?? 0)}</span> },
];

/**
 * DASHBOARD DE GOVERNANÇA da Mesa (o ícone à esquerda de Protocolos · DFDs · Itens), SÓ sobre a execução da Mesa (os
 * protocolos/DFDs dela + o histórico de execução deles):
 * - KPIs — a Mesa AGORA (as listas com os filtros Responsável/Assunto do topo);
 * - a BARRA DE MÉTRICAS (período · medida · pessoa · natureza · tipo de DFD) — vale para tudo abaixo dela, sobre o
 *   UNIVERSO (a Mesa com o Assunto do topo) com o Responsável do topo como FOCO: numa pessoa, só ela, no papel escolhido —
 *   os mesmos números da linha da pessoa na visão da equipe;
 * - as tabelas por período da distribuição (pessoa, natureza e tipo × Hoje | Semana | Mês | Ano | Na Mesa + as correções)
 *   e o DESEMPENHO POR PESSOA (conformidade, correções, ações e tempo — como cada usuário está se saindo);
 * - os quadros da Mesa sobre o recorte: evolução, saúde, situação, tempo na Mesa, carga por pessoa (estado ou situação;
 *   pelo Responsável, tocar filtra a Mesa) e valor por unidade.
 * Agregação PURA (`painelMesa` + `mesa-metricas`); toda célula/coluna abre a ORIGEM dos dados (Σ = o número).
 */
export function DashboardMesa({
  protocolos,
  dfds,
  universo,
  situacoes,
  pessoas,
  regras,
  responsavel,
  onResponsavel,
  onAbrir,
  metricas,
}: {
  /** A Mesa agora (com os filtros do topo) — as KPIs. */
  protocolos: ProtocoloPainel[];
  dfds: DfdPainel[];
  /** O UNIVERSO das métricas: a Mesa só com o Assunto do topo (sem foco, os mesmos arrays de `protocolos`/`dfds`). */
  universo: { protocolos: ProtocoloPainel[]; dfds: DfdPainel[] };
  /** As situações cadastradas pelo ADM (ordem + nome + cor). */
  situacoes: SituacaoCadastrada[];
  /** Foto + apelido de quem aparece (responsáveis, quem protocolou e quem agiu). */
  pessoas: ReadonlyMap<number, Pessoa>;
  regras: RegrasAvaliacao;
  /** O filtro de Responsável do topo — o FOCO das métricas (e a linha marcada na carga). */
  responsavel: FiltroMesa["responsavel"];
  onResponsavel: (v: FiltroMesa["responsavel"]) => void;
  /** Abre o banner do protocolo/DFD de uma linha da ORIGEM dos dados (a pilha da Mesa). */
  onAbrir?: (a: AberturaMesa) => void;
  metricas: MetricasDashboard;
}) {
  const { filtro, hoje } = metricas;
  const idDesempenho = useId();
  const [origem, setOrigem] = useState<Origem | null>(null);
  const [mostrada, setMostrada] = useState<Origem | null>(null); // fica exibida enquanto o banner fecha
  const [cargaPor, setCargaPor] = useState<"estado" | "situacao">("estado");
  const abrirOrigem = (o: Origem) => {
    setOrigem(o);
    setMostrada(o);
  };
  const idsSituacoes = useMemo(() => situacoes.map((s) => s.id), [situacoes]);
  // KPIs = a Mesa AGORA (todos os protocolos/DFDs em escopo), como sempre.
  const pMesa = useMemo(() => painelMesa({ protocolos, dfds, situacoes: idsSituacoes }, new Date()), [protocolos, dfds, idsSituacoes]);
  // O RECORTE da barra de métricas — a fonte única dos quadros abaixo dela: o universo com o FOCO do topo.
  const rec = useMemo(
    () => recorteMetricas(universo.protocolos, universo.dfds, metricas.atividades, filtro, hoje, responsavel),
    [universo, metricas.atividades, filtro, hoje, responsavel],
  );
  // Nos quadros da Mesa a PESSOA segue a dimensão escolhida (a Carga agrupa pela Distribuição quando é ela).
  const protosQ = useMemo(
    () => (filtro.pessoa === "distribuicao" ? rec.coorte.map((x) => ({ ...x, responsavelId: x.distribuidorId ?? null })) : rec.coorte),
    [rec, filtro.pessoa],
  );
  const dfdsQ = useMemo(() => dfdsDoRecorteMetricas(universo.dfds, rec), [universo, rec]);
  const p = useMemo(() => painelMesa({ protocolos: protosQ, dfds: dfdsQ, situacoes: idsSituacoes }, new Date()), [protosQ, dfdsQ, idsSituacoes]);
  const tabelas = useMemo(() => ({ pessoa: tabelaMetricas(rec, "pessoa"), natureza: tabelaMetricas(rec, "natureza"), tipo: tabelaMetricas(rec, "tipo") }), [rec]);
  const desempenho = useMemo(() => desempenhoPorPessoa(rec), [rec]);
  const resumo = useMemo(() => resumoMetricas(rec), [rec]);
  const baldes = useMemo(() => baldesEvolucao(filtro.periodo, filtro.ref, hoje), [filtro.periodo, filtro.ref, hoje]);
  const evolucao = useMemo(() => evolucaoMetricas(rec, baldes), [rec, baldes]);
  // As naturezas do FOCO (antes da natureza/tipo) e os dias com protocolação (os pontos do seletor de data).
  const naturezas = useMemo(
    () => opcoesNatureza(responsavel === "todos" ? universo.protocolos : universo.protocolos.filter((p) => noFoco(p, responsavel, filtro.pessoa))),
    [universo, responsavel, filtro.pessoa],
  );
  const diasComDados = useMemo(() => new Set([...rec.dia.values()].filter((d): d is string => d != null)), [rec]);
  const sitPorPessoa = useMemo(() => situacoesPorPessoa(protosQ, "responsavel", idsSituacoes), [protosQ, idsSituacoes]);
  const cores = useMemo<Record<EstadoPainel, string>>(
    () => ({
      regular: estadoProtocoloCor("regular", regras),
      atencao: estadoProtocoloCor("atencao", regras),
      erro: estadoProtocoloCor("erro", regras),
      conferindo: "var(--border-2)",
      naoConferido: "var(--faint)",
    }),
    [regras],
  );
  const situacaoPorId = useMemo(() => new Map(situacoes.map((s) => [s.id, s])), [situacoes]);

  // ---- Pessoas, medida e janelas ----
  const porDistribuicao = filtro.pessoa === "distribuicao";
  const rotuloDimensao = porDistribuicao ? "Distribuição" : "Responsável";
  const nomePessoa = (id: number | null) => {
    if (id == null) return porDistribuicao ? "Sem registro de quem protocolou" : "Sem responsável";
    const pe = pessoas.get(id);
    return pe ? nomeExibicao(pe) : `Pessoa #${id}`;
  };
  const rotuloPessoa = (id: number | null): ReactNode => {
    const pe = id != null ? pessoas.get(id) : undefined;
    return (
      <span className="inline-flex min-w-0 max-w-full items-center gap-2 align-middle">
        {id == null ? (
          <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-surface-2 text-faint">
            <IconUser className="h-3.5 w-3.5" />
          </span>
        ) : (
          <Avatar nome={pe?.nome ?? nomePessoa(id)} foto={pe?.foto} size="xs" />
        )}
        <span className="truncate">{nomePessoa(id)}</span>
      </span>
    );
  };
  const rotuloMedida = MEDIDAS_METRICAS.find((m) => m.value === filtro.medida)?.label ?? "Protocolos";
  const formatar = (n: number) => (filtro.medida === "valor" ? brlCompact(n) : num(n));
  const janela = (c: PeriodoMetricas) => rotuloPeriodo(c, filtro.ref, hoje);
  const recortado = filtro.periodo !== "tudo" || recorteFiltrado(filtro) || responsavel !== "todos";
  const semNada = recortado ? "Nenhum protocolo no recorte" : "Nenhum protocolo na Mesa";

  const estadoTag = (e: EstadoPainel) => (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-text-2">
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: cores[e] }} />
      {ROTULO_ESTADO[e]}
    </span>
  );
  const origemProtocolos = (quadro: string, rotulo: string, r: RecorteMesa) =>
    abrirOrigem({ quadro, rotulo, tipo: "protocolos", lista: protocolosDoRecorte(protosQ, r, idsSituacoes, new Date()) });
  const colsProto: Column<ProtocoloPainel>[] = [
    { key: "estado", header: "Estado", nowrap: true, value: (x) => ROTULO_ESTADO[x.estado], render: (x) => estadoTag(x.estado) },
    { key: "numero", header: "Nº processo", nowrap: true, value: (x) => x.numero ?? "—", render: (x) => <span className="font-mono text-[12px] font-semibold">{x.numero ?? "—"}</span> },
    { key: "assunto", header: "Assunto", align: "left", minWidth: 200, value: (x) => x.assunto ?? "—", render: (x) => <span className="line-clamp-2">{x.assunto ?? "—"}</span> },
    { key: "sigla", header: "Unidade", nowrap: true, value: (x) => x.sigla ?? "—", render: (x) => <span className="font-mono text-[12px] text-text-2">{x.sigla ?? "—"}</span> },
    { key: "situacao", header: "Situação", nowrap: true, value: (x) => (x.situacaoId != null ? (situacaoPorId.get(x.situacaoId)?.nome ?? "Sem situação") : "Sem situação") },
    { key: "valor", header: "Valor", align: "right", nowrap: true, filter: "range", numero: (x) => x.valor, render: (x) => <span className="font-semibold tabular-nums">{brl(x.valor)}</span> },
  ];
  // As origens das MÉTRICAS: a data, o processo, a natureza, a pessoa e — fora da medida Protocolos — o valor na medida
  // (Σ = o número tocado).
  const colMedida = <R,>(medida: MedidaMetricas, valor: (r: R) => number): Column<R>[] =>
    medida === "protocolos"
      ? []
      : [
          {
            key: "medida",
            header: MEDIDAS_METRICAS.find((m) => m.value === medida)?.label ?? "",
            align: medida === "valor" ? "right" : "center",
            nowrap: true,
            filter: "range",
            numero: valor,
            formatarFaixa: medida === "valor" ? undefined : (n) => num(n),
            render: (r) => <span className="font-semibold tabular-nums">{medida === "valor" ? brl(valor(r)) : num(valor(r))}</span>,
          },
        ];
  const colsMetricas = (medida: MedidaMetricas): Column<OrigemMetricas<ProtocoloPainel>>[] => [
    { key: "data", header: "Protocolação", nowrap: true, filter: "date", value: (o) => diaDoProtocolo(o.protocolo.criadoEm) ?? "", render: (o) => dataBR(diaDoProtocolo(o.protocolo.criadoEm)) },
    { key: "numero", header: "Nº processo", nowrap: true, value: (o) => o.protocolo.numero ?? "—", render: (o) => <span className="font-mono text-[12px] font-semibold">{o.protocolo.numero ?? "—"}</span> },
    { key: "natureza", header: "Natureza", nowrap: true, value: (o) => naturezaDoProtocolo(o.protocolo.assunto, o.protocolo.anoPca).rotulo },
    {
      key: "pessoa",
      header: rotuloDimensao,
      align: "left",
      nowrap: true,
      value: (o) => nomePessoa(porDistribuicao ? (o.protocolo.distribuidorId ?? null) : o.protocolo.responsavelId),
      render: (o) => rotuloPessoa(porDistribuicao ? (o.protocolo.distribuidorId ?? null) : o.protocolo.responsavelId),
    },
    { key: "estado", header: "Estado", nowrap: true, value: (o) => ROTULO_ESTADO[o.protocolo.estado], render: (o) => estadoTag(o.protocolo.estado) },
    ...colMedida<OrigemMetricas<ProtocoloPainel>>(medida, (o) => o.valor),
  ];
  const colsCorrecoes = (medida: MedidaMetricas): Column<CorrecaoOrigem<ProtocoloPainel>>[] => [
    { key: "data", header: "Reenvio", nowrap: true, filter: "date", value: (c) => c.dia, render: (c) => dataBR(c.dia) },
    { key: "numero", header: "Nº processo", nowrap: true, value: (c) => c.protocolo.numero ?? "—", render: (c) => <span className="font-mono text-[12px] font-semibold">{c.protocolo.numero ?? "—"}</span> },
    { key: "natureza", header: "Natureza", nowrap: true, value: (c) => naturezaDoProtocolo(c.protocolo.assunto, c.protocolo.anoPca).rotulo },
    { key: "quem", header: "Reenviado por", align: "left", nowrap: true, value: (c) => (c.usuarioId != null ? nomePessoa(c.usuarioId) : "—"), render: (c) => (c.usuarioId != null ? rotuloPessoa(c.usuarioId) : "—") },
    { key: "n", header: "Reenvios", nowrap: true, filter: "range", numero: (c) => c.n, formatarFaixa: (n) => num(n), render: (c) => num(c.n) },
    ...colMedida<CorrecaoOrigem<ProtocoloPainel>>(medida, (c) => c.valor),
  ];

  // ---- Tabelas por período (a planilha) ----
  const colunasT = colunasMetricas(filtro.ref, hoje);
  const corpoTabela = (t: TabelaMetricas, ag: AgrupamentoMetricas): LinhaTabelaPeriodo[] =>
    t.linhas.map((l) => ({
      chave: l.chave,
      rotulo: ag === "pessoa" ? rotuloPessoa(l.pessoaId) : l.rotulo,
      titulo: ag === "pessoa" ? nomePessoa(l.pessoaId) : l.rotulo,
      valores: l.valores,
    }));
  const totalTabela = (t: TabelaMetricas): LinhaTabelaPeriodo => ({ chave: TOTAL, rotulo: "Total", titulo: "Total", valores: t.total });
  // Correções: "…" enquanto o histórico carrega; some se ele falhou (a linha do recorte oferece "Tentar de novo").
  const extrasTabela = (t: TabelaMetricas, ag: AgrupamentoMetricas): LinhaTabelaPeriodo[] =>
    ag === "tipo" || (t.correcoes == null && metricas.erro)
      ? []
      : [{ chave: CORRECOES, rotulo: "Correções (reenvios)", titulo: "Correções — os reenvios dos protocolos", valores: t.correcoes }];
  const escolherCelula = (quadro: string, ag: AgrupamentoMetricas) => (l: LinhaTabelaPeriodo, c: ColunaTabelaPeriodo) => {
    const coluna = c.chave as PeriodoMetricas;
    if (l.chave === CORRECOES)
      return abrirOrigem({ quadro, rotulo: `Correções · ${janela(coluna)}`, tipo: "correcoes", medida: filtro.medida, lista: origemCorrecoes(rec, coluna) });
    abrirOrigem({
      quadro,
      rotulo: `${l.chave === TOTAL ? "Total" : l.titulo} · ${janela(coluna)}`,
      tipo: "metricas",
      medida: filtro.medida,
      lista: origemDaCelula(rec, ag, l.chave === TOTAL ? null : l.chave, coluna),
    });
  };
  const tabela = (ag: AgrupamentoMetricas, titulo: string, rotuloLinhas: string, subtitulo: string) => (
    <ChartCard title={titulo} subtitle={subtitulo}>
      {rec.base.length === 0 ? (
        <ChartEmpty label={semNada} />
      ) : (
        <TabelaPeriodo
          ariaLabel={`${titulo}: ${rotuloMedida.toLowerCase()} por período`}
          rotuloLinhas={rotuloLinhas}
          colunas={colunasT}
          destaque={filtro.periodo}
          linhas={corpoTabela(tabelas[ag], ag)}
          total={totalTabela(tabelas[ag])}
          extras={extrasTabela(tabelas[ag], ag)}
          formatar={formatar}
          alinhar={filtro.medida === "valor" ? "right" : "center"}
          onEscolher={escolherCelula(titulo, ag)}
        />
      )}
    </ChartCard>
  );

  // ---- Desempenho por pessoa ----
  // Governança primeiro (volume → qualidade → retrabalho → execução → tempo); os totais dos DFDs no fim.
  const contagem = (key: string, header: string, v: (l: LinhaDesempenho) => number): Column<LinhaDesempenho> => ({
    key,
    header,
    nowrap: true,
    filter: "range",
    numero: v,
    formatarFaixa: (n) => num(n),
    render: (l) => num(v(l)),
  });
  // Correções e ações vêm do histórico ("…" carregando; "—" se falhou). A linha SEM pessoa ("Sem responsável"/sem
  // registro) não tem ações — "—".
  const doHistorico = (key: string, header: string, v: (l: LinhaDesempenho) => number | null, semPessoa: boolean): Column<LinhaDesempenho> => ({
    key,
    header,
    nowrap: true,
    filter: "range",
    numero: (l) => (semPessoa && l.pessoaId == null ? null : v(l)),
    formatarFaixa: (n) => num(n),
    render: (l) => {
      if (semPessoa && l.pessoaId == null) return "—";
      const x = v(l);
      return x == null ? (metricas.erro ? "—" : "…") : num(x);
    },
  });
  const colsDesempenho: Column<LinhaDesempenho>[] = [
    { key: "pessoa", header: rotuloDimensao, align: "left", nowrap: true, value: (l) => nomePessoa(l.pessoaId), render: (l) => rotuloPessoa(l.pessoaId) },
    contagem("protocolos", "Protocolos", (l) => l.protocolos),
    {
      key: "regulares",
      header: "Regulares",
      nowrap: true,
      filter: "range",
      numero: (l) => (l.conferidos > 0 ? (l.regulares / l.conferidos) * 100 : null),
      formatarFaixa: (n) => `${Math.round(n)}%`,
      render: (l) => (l.conferidos > 0 ? pct(l.regulares, l.conferidos) : "—"),
    },
    {
      key: "erro",
      header: "Com erro",
      nowrap: true,
      filter: "range",
      numero: (l) => l.erro,
      formatarFaixa: (n) => num(n),
      render: (l) => <span style={l.erro > 0 ? { color: cores.erro, fontWeight: 600 } : undefined}>{num(l.erro)}</span>,
    },
    {
      key: "atencao",
      header: "Em atenção",
      nowrap: true,
      filter: "range",
      numero: (l) => l.atencao,
      formatarFaixa: (n) => num(n),
      render: (l) => <span style={l.atencao > 0 ? { color: cores.atencao } : undefined}>{num(l.atencao)}</span>,
    },
    doHistorico("correcoes", "Correções", (l) => l.correcoes, false),
    doHistorico("acoes", "Ações", (l) => l.acoes, true),
    {
      key: "tempo",
      header: "Tempo médio",
      nowrap: true,
      filter: "range",
      numero: (l) => l.diasMedio,
      formatarFaixa: (n) => `${Math.round(n)} d`,
      render: (l) => (l.diasMedio == null ? "—" : plural(Math.round(l.diasMedio), "dia", "dias")),
    },
    {
      key: "alerta",
      header: `+${DIAS_ALERTA} dias`,
      nowrap: true,
      filter: "range",
      numero: (l) => l.acimaAlerta,
      formatarFaixa: (n) => num(n),
      render: (l) => <span style={l.acimaAlerta > 0 ? { color: "var(--warn)", fontWeight: 600 } : undefined}>{num(l.acimaAlerta)}</span>,
    },
    contagem("dfds", "DFDs", (l) => l.dfds),
    {
      key: "dfdsErro",
      header: "DFDs c/ erro",
      nowrap: true,
      filter: "range",
      numero: (l) => l.dfdsErro,
      formatarFaixa: (n) => num(n),
      render: (l) => <span style={l.dfdsErro > 0 ? { color: cores.erro } : undefined}>{num(l.dfdsErro)}</span>,
    },
    contagem("itens", "Itens", (l) => l.itens),
    { key: "valor", header: "Valor", align: "right", nowrap: true, filter: "range", numero: (l) => l.valor, render: (l) => <span className="tabular-nums">{brlCompact(l.valor)}</span> },
  ];

  // ---- Quadros da Mesa (sobre o recorte) ----
  const total = p.protocolos;
  // Ainda em conferência × conferência que FALHOU (não se repete sozinha — a tabela diz "Não conferido").
  const conferindo = p.saude.conferindo.n;
  const naoConferidos = p.saude.naoConferido.n;
  const conferidos = total - conferindo - naoConferidos;
  // Progresso = os PRONTOS (conferidos); os que falharam não contam como prontos — vão à parte, na mesma frase.
  const falhas = naoConferidos > 0 ? ` · ${plural(naoConferidos, "não conferido", "não conferidos")}` : "";
  const segmentosDe = (n: (e: EstadoPainel) => number) =>
    ESTADOS_PAINEL.map((e) => ({ chave: e, valor: n(e), cor: cores[e], rotulo: ROTULO_ESTADO[e] }));
  const segmentosSituacao = (m: ReadonlyMap<number | null, number> | undefined): Segmento[] => [
    ...situacoes.map((s) => ({ chave: String(s.id), valor: m?.get(s.id) ?? 0, cor: s.cor, rotulo: s.nome })),
    { chave: "sem", valor: m?.get(null) ?? 0, cor: "var(--faint)", rotulo: "Sem situação" },
  ];
  const vazio = total === 0;
  // KPIs (a Mesa agora).
  const totalMesa = pMesa.protocolos;
  const conferindoMesa = pMesa.saude.conferindo.n;
  const naoConferidosMesa = pMesa.saude.naoConferido.n;
  const conferidosMesa = totalMesa - conferindoMesa - naoConferidosMesa;
  const falhasMesa = naoConferidosMesa > 0 ? ` · ${plural(naoConferidosMesa, "não conferido", "não conferidos")}` : "";
  const corSaudeMesa = pMesa.saude.erro.n > 0 ? cores.erro : pMesa.saude.atencao.n > 0 ? cores.atencao : cores.regular;
  const ultimas = pMesa.semanas.slice(-7).map((s) => s.n);
  const picoSemana = Math.max(0, ...ultimas);

  // ---- Linhas dos quadros de barras ----
  const linhasSituacao: LinhaBarra[] = p.situacoes.map((s) => {
    const cad = s.id != null ? situacaoPorId.get(s.id) : undefined;
    const nome = cad?.nome ?? "Sem situação";
    return {
      chave: s.id ?? "sem",
      rotulo: nome,
      titulo: `${nome}: ${plural(s.n, "protocolo", "protocolos")} · ${brl(s.valor)}`,
      segmentos: [{ chave: "n", valor: s.n, cor: cad?.cor ?? "var(--faint)", rotulo: nome }],
      valor: num(s.n),
      detalhe: brlCompact(s.valor),
      apagada: s.id == null,
      clicavel: true,
    };
  });
  const listados = new Set(p.responsaveis.map((r) => r.id));
  const linhasResp: LinhaBarra[] = p.responsaveis.map((r) => {
    const pessoa = r.id != null ? pessoas.get(r.id) : undefined;
    const nome = nomePessoa(r.id);
    return {
      chave: r.id ?? "sem",
      rotulo: rotuloPessoa(r.id),
      titulo: `${pessoa && pessoa.nome !== nome ? `${nome} — ${pessoa.nome}` : nome}: ${plural(r.n, "protocolo", "protocolos")} · ${brl(r.valor)}`,
      segmentos: cargaPor === "estado" ? segmentosDe((e) => r.porEstado[e]) : segmentosSituacao(sitPorPessoa.get(r.id)),
      valor: num(r.n),
      detalhe: brlCompact(r.valor),
    };
  });
  if (p.outrosResponsaveis) {
    const o = p.outrosResponsaveis;
    const quem = plural(o.pessoas, "outra pessoa", "outras pessoas");
    // Situações da cauda = a soma das pessoas que não foram listadas.
    const cauda = new Map<number | null, number>();
    for (const [id, m] of sitPorPessoa) if (!listados.has(id)) for (const [s, n] of m) cauda.set(s, (cauda.get(s) ?? 0) + n);
    linhasResp.splice(linhasResp.length - (p.responsaveis.at(-1)?.id == null ? 1 : 0), 0, {
      chave: "outros",
      rotulo: quem,
      titulo: `${quem}: ${plural(o.n, "protocolo", "protocolos")} · ${brl(o.valor)}`,
      segmentos: cargaPor === "estado" ? segmentosDe((e) => o.porEstado[e]) : segmentosSituacao(cauda),
      valor: num(o.n),
      detalhe: brlCompact(o.valor),
      apagada: true,
    });
  }
  const linhasUnidade: LinhaBarra[] = p.unidades.map((u) => ({
    chave: u.chave,
    rotulo: u.sigla ? <span className="font-mono text-[12px] font-semibold">{u.sigla}</span> : "Sem unidade",
    titulo: `${u.nome ?? (u.sigla || "Sem unidade")}: ${brl(u.valor)} · ${plural(u.dfds, "DFD", "DFDs")}`,
    segmentos: [{ chave: "v", valor: u.valor, cor: "var(--accent)", rotulo: "Valor" }],
    valor: brlCompact(u.valor),
    detalhe: pct(u.valor, p.valor),
    apagada: !u.sigla,
    clicavel: true,
  }));
  if (p.outrasUnidades) {
    const o = p.outrasUnidades;
    const quais = plural(o.unidades, "outra unidade", "outras unidades");
    linhasUnidade.push({
      chave: "outras",
      rotulo: quais,
      titulo: `${quais}: ${brl(o.valor)} · ${plural(o.dfds, "DFD", "DFDs")}`,
      segmentos: [{ chave: "v", valor: o.valor, cor: "var(--accent)", rotulo: "Valor" }],
      valor: brlCompact(o.valor),
      detalhe: pct(o.valor, p.valor),
      apagada: true,
      clicavel: true,
    });
  }
  const ativaResp = responsavel === "todos" || porDistribuicao ? null : responsavel;
  // Legenda da Carga (identidade nunca só pela cor): os estados ou as situações presentes.
  const legendaCarga =
    cargaPor === "estado"
      ? ESTADOS_PAINEL.filter((e) => p.saude[e].n > 0).map((e) => ({ chave: e, cor: cores[e], rotulo: ROTULO_ESTADO[e] }))
      : p.situacoes
          .filter((s) => s.n > 0)
          .map((s) => ({ chave: String(s.id ?? "sem"), cor: (s.id != null && situacaoPorId.get(s.id)?.cor) || "var(--faint)", rotulo: s.id != null ? (situacaoPorId.get(s.id)?.nome ?? "Sem situação") : "Sem situação" }));

  // ---- Evolução ----
  const somaEvolucao = evolucao.reduce((t, v) => t + v, 0);
  const subtituloEvolucao =
    filtro.periodo === "tudo"
      ? `${rotuloMedida} por semana de protocolação — últimas ${baldes.length} semanas`
      : filtro.periodo === "ano"
        ? `${rotuloMedida} por mês de protocolação em ${filtro.ref.slice(0, 4)}`
        : filtro.periodo === "mes"
          ? `${rotuloMedida} por dia de protocolação — ${janela("mes").toLowerCase()}`
          : `${rotuloMedida} por dia de protocolação — a semana de ${dataBR(baldes[0]?.de).slice(0, 5)} a ${dataBR(baldes.at(-1)?.ate).slice(0, 5)}`;
  const textoMedida = (n: number) =>
    filtro.medida === "protocolos"
      ? plural(n, "protocolo", "protocolos")
      : filtro.medida === "dfds"
        ? plural(n, "DFD", "DFDs")
        : filtro.medida === "itens"
          ? plural(n, "item", "itens")
          : brl(n);

  // ---- Linha do recorte + aviso do filtro do topo ----
  const execucao = metricas.erro ? (
    <span className="inline-flex items-center gap-1">
      histórico indisponível
      <Button variant="ghost" size="xs" onClick={metricas.onTentar}>
        Tentar de novo
      </Button>
    </span>
  ) : resumo.correcoes == null ? (
    <span>correções e ações: carregando…</span>
  ) : (
    <span>
      {plural(resumo.correcoes, "correção", "correções")}
      {resumo.corrigidos ? ` (${plural(resumo.corrigidos, "protocolo", "protocolos")})` : ""}
      {/* Sem ninguém no recorte (os sem responsável) não há de quem contar ações. */}
      {resumo.acoes != null && ` · ${plural(resumo.acoes, "ação", "ações")}`}
    </span>
  );
  const linhaRecorte = (
    <>
      <span>
        <strong className="font-semibold text-text-2">{janela(filtro.periodo)}</strong> · {plural(resumo.protocolos, "protocolo", "protocolos")} ·{" "}
        {plural(resumo.dfds, "DFD", "DFDs")} · {plural(resumo.itens, "item", "itens")} · {brlCompact(resumo.valor)}
      </span>
      {execucao}
    </>
  );
  // O FOCO do topo: a pessoa no PAPEL escolhido na barra (os números = a linha da pessoa na visão da equipe).
  const aviso =
    responsavel !== "todos" ? (
      <span className="inline-flex items-center gap-1.5 text-text-2">
        <IconInfo className="h-3.5 w-3.5 shrink-0 text-accent" />
        {responsavel === "sem"
          ? "Só os protocolos sem responsável"
          : `Só ${nomeExibicao(pessoas.get(responsavel) ?? { nome: `Pessoa #${responsavel}` })}, ${porDistribuicao ? "como quem protocolou" : "como responsável"}`}{" "}
        (filtro Responsável do topo) — escolha “Todos” para comparar a equipe.
      </span>
    ) : null;

  const medidaOrigem = mostrada && (mostrada.tipo === "metricas" || mostrada.tipo === "correcoes") ? mostrada.medida : "protocolos";

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="grid grid-cols-2 gap-[var(--gap-block)] lg:grid-cols-5">
        <div className="col-span-2 lg:col-span-1">
          <KpiStat
            label="Protocolos na Mesa"
            value={num(totalMesa)}
            hint={`${plural(pMesa.dfds, "DFD", "DFDs")} · ${plural(pMesa.itens, "item", "itens")}`}
            spark={picoSemana > 0 ? ultimas.map((n) => (n / picoSemana) * 100) : undefined}
          />
        </div>
        <KpiStat label="Valor na Mesa" value={brlCompact(pMesa.valor)} cor="var(--sit-finalizado)" hint="somatória dos DFDs" />
        <KpiStat
          label="Conformidade"
          value={conferidosMesa > 0 ? pct(pMesa.saude.regular.n, conferidosMesa) : "—"}
          cor={corSaudeMesa}
          hint={
            conferindoMesa > 0
              ? `conferindo ${num(conferidosMesa)} de ${num(totalMesa)}…${falhasMesa}`
              : naoConferidosMesa > 0
                ? `${num(naoConferidosMesa)} não conferido${naoConferidosMesa === 1 ? "" : "s"} · ${num(pMesa.saude.erro.n)} com erro`
                : `${num(pMesa.saude.erro.n)} com erro · ${num(pMesa.saude.atencao.n)} em atenção`
          }
        />
        <KpiStat
          label="Com responsável"
          value={totalMesa > 0 ? pct(totalMesa - pMesa.semResponsavel, totalMesa) : "—"}
          cor={pMesa.semResponsavel > 0 ? "var(--warn)" : "var(--ok)"}
          hint={pMesa.semResponsavel > 0 ? `${num(pMesa.semResponsavel)} sem responsável` : "todos com responsável"}
        />
        <KpiStat
          label="Tempo médio na Mesa"
          value={pMesa.diasMedio == null ? "—" : plural(Math.round(pMesa.diasMedio), "dia", "dias")}
          cor="var(--sit-devolvido)"
          hint={pMesa.acimaAlerta > 0 ? `${num(pMesa.acimaAlerta)} há mais de ${DIAS_ALERTA} dias` : `nenhum há mais de ${DIAS_ALERTA} dias`}
        />
      </div>

      <BarraMetricas filtro={filtro} onFiltro={metricas.onFiltro} hoje={hoje} naturezas={naturezas} diasComDados={diasComDados} resumo={linhaRecorte} aviso={aviso} />

      <div className="grid grid-cols-1 gap-[var(--gap-block)] md:grid-cols-2 xl:grid-cols-3">
        {tabela("pessoa", "Distribuição por pessoa", rotuloDimensao, `${rotuloMedida} por ${rotuloDimensao.toLowerCase()} — toque num número para ver a origem`)}
        {tabela("natureza", "Natureza do protocolo", "Natureza", `${rotuloMedida} pela categoria do assunto e o ano do PCA, e as correções`)}
        {tabela(
          "tipo",
          "Tipo de DFD",
          "Tipo",
          filtro.medida === "protocolos" ? "Protocolos por tipo de DFD — um protocolo com tipos diferentes conta em cada um" : `${rotuloMedida} por tipo de DFD`,
        )}
      </div>

      <section aria-labelledby={idDesempenho} className="space-y-2">
        <div>
          <h3 id={idDesempenho} className="text-sm font-semibold text-text">
            Desempenho por pessoa
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {filtro.periodo === "tudo" ? "Os protocolos na Mesa" : `Os protocolados ${frasePeriodo(filtro.periodo, filtro.ref)}`} por{" "}
            {rotuloDimensao.toLowerCase()}: conformidade, correções recebidas, ações feitas e tempo na Mesa — toque numa linha para ver os protocolos.
          </p>
        </div>
        <DataTable
          columns={colsDesempenho}
          rows={desempenho}
          getKey={(l) => l.chave}
          pageSize={20}
          minWidth={1080}
          density="compact"
          vazio={semNada}
          onRowClick={(l) =>
            abrirOrigem({
              quadro: "Desempenho por pessoa",
              rotulo: `${nomePessoa(l.pessoaId)} · ${janela(filtro.periodo)}`,
              tipo: "metricas",
              medida: filtro.medida,
              lista: protocolosDaPessoa(rec, l.chave),
            })
          }
          resumo={(ls) =>
            `${plural(ls.filter((l) => l.pessoaId != null).length, "pessoa", "pessoas")} · ${plural(
              ls.reduce((t, l) => t + l.protocolos, 0),
              "protocolo",
              "protocolos",
            )}`
          }
        />
      </section>

      <div className="grid grid-cols-1 gap-[var(--gap-block)] md:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          title="Evolução"
          subtitle={subtituloEvolucao}
          action={<span className="whitespace-nowrap text-[12px] font-semibold text-text-2 tabular-nums">{formatar(somaEvolucao)} no período</span>}
        >
          <Colunas
            ariaLabel={`Evolução: ${rotuloMedida.toLowerCase()} por período`}
            formatar={formatar}
            rotularTodas={baldes.length <= 7}
            onEscolher={(k) => {
              const b = baldes.find((x) => x.chave === k);
              if (b) abrirOrigem({ quadro: "Evolução", rotulo: b.dica, tipo: "metricas", medida: filtro.medida, lista: origemDoBalde(rec, b) });
            }}
            colunas={baldes.map((b, i) => ({
              chave: b.chave,
              rotulo: b.rotulo,
              valor: evolucao[i],
              cor: b.atual ? "var(--accent)" : COR_BALDE,
              dica: { valor: textoMedida(evolucao[i]), rotulo: `${b.dica}${b.atual && filtro.periodo !== "dia" ? " (atual)" : ""}` },
            }))}
          />
        </ChartCard>

        <ChartCard
          title="Saúde dos protocolos"
          subtitle={
            conferindo > 0
              ? `Conferindo ${num(conferidos)} de ${num(total)}…${falhas}`
              : naoConferidos > 0
                ? `${plural(naoConferidos, "protocolo não conferido", "protocolos não conferidos")} — recarregue a página para tentar de novo`
                : "Estado agregado (capa, DFDs e itens) pelas regras do ADM"
          }
        >
          {vazio ? (
            <ChartEmpty label={semNada} />
          ) : (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[2rem] font-bold leading-none tracking-[-0.03em] text-text">
                  {conferidos > 0 ? pct(p.saude.regular.n, conferidos) : "—"}
                </span>
                <span className="text-[12.5px] text-muted">
                  regulares{conferidos < total ? ` · de ${plural(conferidos, "conferido", "conferidos")}` : ""}
                </span>
              </div>
              <BarraSegmentada trilho altura={12} segmentos={segmentosDe((e) => p.saude[e].n)} />
              <ul aria-label="Protocolos por estado" className="space-y-1">
                {ESTADOS_PAINEL.filter((e) => (e !== "conferindo" && e !== "naoConferido") || p.saude[e].n > 0).map((e) => (
                  <li key={e}>
                    {/* Tocar no estado abre a ORIGEM dos dados (os protocolos dele) — alvo ≥ 44px no toque. */}
                    <button
                      type="button"
                      onClick={() => origemProtocolos("Saúde dos protocolos", ROTULO_ESTADO[e], { dim: "estado", estado: e })}
                      aria-label={`${ROTULO_ESTADO[e]}: ${plural(p.saude[e].n, "protocolo", "protocolos")} — ver a origem dos dados`}
                      className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto_3.5rem_4.5rem] items-center gap-x-3 rounded-control px-1.5 text-[12.5px] transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:min-h-8"
                    >
                      <span className="inline-flex min-w-0 items-center gap-2 text-text-2">
                        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cores[e] }} />
                        <span className="truncate">{ROTULO_ESTADO[e]}</span>
                      </span>
                      <span className="text-right font-semibold text-text tabular-nums">{num(p.saude[e].n)}</span>
                      <span className="text-right text-muted tabular-nums">{pct(p.saude[e].n, total)}</span>
                      <span className="text-right text-muted tabular-nums">{brlCompact(p.saude[e].valor)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Situação" subtitle="As situações cadastradas pelo ADM, na ordem do cadastro">
          {situacoes.length === 0 ? (
            <ChartEmpty label="Nenhuma situação cadastrada (Configurações → Situações)" />
          ) : vazio ? (
            <ChartEmpty label={semNada} />
          ) : (
            <BarrasH
              ariaLabel="Protocolos por situação"
              linhas={linhasSituacao}
              acao="ver a origem dos dados"
              onEscolher={(k) => {
                const id = k === "sem" ? null : Number(k);
                const nome = id != null ? (situacaoPorId.get(id)?.nome ?? "Sem situação") : "Sem situação";
                origemProtocolos("Situação", nome, { dim: "situacao", id });
              }}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Tempo na Mesa"
          subtitle={p.diasMaximo != null ? `Dias desde a protocolação · o mais antigo tem ${plural(p.diasMaximo, "dia", "dias")}` : "Dias desde a protocolação"}
        >
          {vazio ? (
            <ChartEmpty label={semNada} />
          ) : (
            <Colunas
              ariaLabel="Protocolos por tempo na Mesa"
              rotularTodas
              onEscolher={(k) => {
                const faixa = FAIXAS_IDADE.findIndex((f) => f.curto === k);
                if (faixa >= 0) origemProtocolos("Tempo na Mesa", FAIXAS_IDADE[faixa].rotulo, { dim: "idade", faixa });
              }}
              colunas={p.faixasIdade.map((f, i) => ({
                chave: f.curto,
                rotulo: f.curto,
                valor: f.n,
                cor: RAMPA_IDADE[i],
                dica: { valor: `${plural(f.n, "protocolo", "protocolos")} · ${brlCompact(f.valor)}`, rotulo: f.rotulo },
              }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title={`Carga por ${porDistribuicao ? "distribuição" : "responsável"}`}
          subtitle={`Protocolos por pessoa e ${cargaPor === "estado" ? "estado" : "situação"} — ${
            porDistribuicao ? "toque numa pessoa para ver os protocolos" : "toque numa pessoa para filtrar a Mesa"
          }`}
        >
          {vazio ? (
            <ChartEmpty label={semNada} />
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <Segmented<"estado" | "situacao">
                  ariaLabel="Carga por"
                  value={cargaPor}
                  onChange={setCargaPor}
                  options={[
                    { value: "estado", label: "Estado" },
                    { value: "situacao", label: "Situação" },
                  ]}
                />
                <ul aria-label={cargaPor === "estado" ? "Legenda dos estados" : "Legenda das situações"} className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted">
                  {legendaCarga.map((l) => (
                    <li key={l.chave} className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: l.cor }} />
                      {l.rotulo}
                    </li>
                  ))}
                </ul>
              </div>
              <BarrasH
                ariaLabel={`Protocolos por ${porDistribuicao ? "quem protocolou" : "responsável"}`}
                linhas={linhasResp}
                ativa={ativaResp}
                acao={porDistribuicao ? "ver os protocolos" : undefined}
                onEscolher={(k) => {
                  if (!porDistribuicao) return onResponsavel(k === ativaResp ? "todos" : k === "sem" ? "sem" : Number(k));
                  const chave = String(k);
                  abrirOrigem({
                    quadro: "Carga por distribuição",
                    rotulo: nomePessoa(chave === "sem" ? null : Number(chave)),
                    tipo: "protocolos",
                    lista: rec.coorte.filter((x) => chavePessoa(x.distribuidorId ?? null) === chave),
                  });
                }}
              />
            </>
          )}
        </ChartCard>

        <ChartCard title="Valor por unidade" subtitle="Somatória dos DFDs por unidade requisitante (participação no total)">
          {p.dfds === 0 ? (
            <ChartEmpty label={recortado ? "Nenhum DFD no recorte" : "Nenhum DFD na Mesa"} />
          ) : (
            <BarrasH
              ariaLabel="Valor dos DFDs por unidade"
              linhas={linhasUnidade}
              acao="ver a origem dos dados"
              onEscolher={(k) => {
                const outras = k === "outras";
                const u = p.unidades.find((x) => x.chave === k);
                abrirOrigem({
                  quadro: "Valor por unidade",
                  rotulo: outras ? plural(p.outrasUnidades?.unidades ?? 0, "outra unidade", "outras unidades") : u?.sigla || "Sem unidade",
                  tipo: "dfds",
                  lista: outras ? dfdsDoRecorte(dfdsQ, p.unidades.map((x) => x.chave), true) : dfdsDoRecorte(dfdsQ, [String(k)]),
                });
              }}
            />
          )}
        </ChartCard>
      </div>

      <OrigemDados
        aberto={origem != null}
        onClose={() => setOrigem(null)}
        titulo={mostrada?.quadro ?? ""}
        recorte={mostrada?.rotulo ?? ""}
        resumo={
          mostrada?.tipo === "correcoes"
            ? [
                { label: "Reenvios", value: num(mostrada.lista.reduce((t, c) => t + c.n, 0)) },
                { label: "Protocolos", value: num(new Set(mostrada.lista.map((c) => c.protocolo.id)).size) },
                ...(medidaOrigem !== "protocolos" ? [{ label: rotuloDaMedida(medidaOrigem), value: formatarMedida(medidaOrigem, mostrada.lista.reduce((t, c) => t + c.valor, 0)) }] : []),
              ]
            : mostrada?.tipo === "metricas"
              ? [
                  { label: "Protocolos", value: num(mostrada.lista.length) },
                  ...(medidaOrigem !== "protocolos" ? [{ label: rotuloDaMedida(medidaOrigem), value: formatarMedida(medidaOrigem, mostrada.lista.reduce((t, o) => t + o.valor, 0)) }] : []),
                ]
              : [
                  { label: mostrada?.tipo === "dfds" ? "DFDs" : "Protocolos", value: num(mostrada?.lista.length ?? 0) },
                  {
                    label: "Valor",
                    value: brl(
                      mostrada?.tipo === "dfds"
                        ? mostrada.lista.reduce((t, x) => t + (x.valor ?? 0), 0)
                        : mostrada?.tipo === "protocolos"
                          ? mostrada.lista.reduce((t, x) => t + x.valor, 0)
                          : 0,
                    ),
                  },
                ]
        }
        fonte={
          mostrada?.tipo === "dfds"
            ? "Os DFDs dos protocolos do recorte (a Mesa com o Assunto do topo; com uma pessoa no Responsável do topo, só os protocolos da pessoa no papel escolhido; o período e a natureza/tipo da barra), pela unidade requisitante."
            : mostrada?.tipo === "correcoes"
              ? "O histórico dos protocolos do recorte: cada reenvio (o processo devolvido que volta corrigido), pela data em que foi reenviado. Em DFDs, itens ou valor, cada reenvio conta o processo de novo."
              : mostrada?.tipo === "metricas"
                ? "Os protocolos do recorte (a Mesa com o Assunto do topo; com uma pessoa no Responsável do topo, só os protocolos da pessoa no papel escolhido; a natureza/tipo da barra) protocolados na janela, pela data da protocolação (dia de Brasília); DFDs, itens e valor pelos DFDs de cada um — só os do tipo filtrado, quando há."
                : "Os protocolos do recorte (a Mesa com o Assunto do topo; com uma pessoa no Responsável do topo, só os protocolos da pessoa no papel escolhido; o período e a natureza/tipo da barra), com o estado AGREGADO da conferência pelas regras do ADM."
        }
      >
        {mostrada?.tipo === "dfds" ? (
          <DataTable
            columns={COLS_DFD}
            rows={mostrada.lista}
            getKey={(d) => d.id ?? `${d.numero}`}
            pageSize={20}
            minWidth={560}
            onRowClick={onAbrir ? (d) => d.id != null && onAbrir({ tipo: "dfd", id: d.id }) : undefined}
            resumo={(ls) => `${plural(ls.length, "DFD", "DFDs")} · ${brl(ls.reduce((t, d) => t + (d.valor ?? 0), 0))}`}
          />
        ) : mostrada?.tipo === "metricas" ? (
          <DataTable
            columns={colsMetricas(mostrada.medida)}
            rows={mostrada.lista}
            getKey={(o) => o.protocolo.id}
            pageSize={20}
            minWidth={760}
            onRowClick={onAbrir ? (o) => onAbrir({ tipo: "protocolo", id: o.protocolo.id }) : undefined}
            resumo={(ls) =>
              `${plural(ls.length, "protocolo", "protocolos")}${
                mostrada.medida !== "protocolos" ? ` · ${formatarMedida(mostrada.medida, ls.reduce((t, o) => t + o.valor, 0))}` : ""
              }`
            }
          />
        ) : mostrada?.tipo === "correcoes" ? (
          <DataTable
            columns={colsCorrecoes(mostrada.medida)}
            rows={mostrada.lista}
            getKey={(c) => `${c.protocolo.id}:${c.dia}:${c.usuarioId ?? ""}`}
            pageSize={20}
            minWidth={760}
            onRowClick={onAbrir ? (c) => onAbrir({ tipo: "protocolo", id: c.protocolo.id }) : undefined}
            resumo={(ls) => plural(ls.reduce((t, c) => t + c.n, 0), "reenvio", "reenvios")}
          />
        ) : (
          <DataTable
            columns={colsProto}
            rows={mostrada?.tipo === "protocolos" ? mostrada.lista : []}
            getKey={(x) => x.id}
            pageSize={20}
            minWidth={760}
            onRowClick={onAbrir ? (x) => onAbrir({ tipo: "protocolo", id: x.id }) : undefined}
            resumo={(ls) => `${plural(ls.length, "protocolo", "protocolos")} · ${brl(ls.reduce((t, x) => t + x.valor, 0))}`}
          />
        )}
      </OrigemDados>
    </div>
  );
}
