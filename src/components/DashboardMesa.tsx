"use client";

import { type ReactNode, useId, useMemo, useState } from "react";
import type { RegrasAvaliacao } from "@/lib/avaliacao-core";
import { estadoProtocoloCor } from "@/lib/dfd-tratamento";
import { brl, brlCompact, dataBR, num, pct } from "@/lib/format";
import { DIAS_ALERTA, type DfdPainel, type EstadoPainel, painelMesa, type ProtocoloPainel, ROTULO_ESTADO_PAINEL } from "@/lib/mesa-dashboard";
import type { FiltroMesa } from "@/lib/mesa-filtros";
import { METRICAS_TODAS, type MetricasPermitidas } from "@/lib/mesa-visao-core";
import {
  anosComDados,
  type Atividade,
  desempenhoPorPessoa,
  diaDoProtocolo,
  type EventoOrigem,
  type FiltroMetricas,
  graficoMetricas,
  type LinhaDesempenho,
  type LinhaGrafico,
  MEDIDAS_METRICAS,
  type MedidaMetricas,
  medidaDeEvento,
  naturezaDoProtocolo,
  type OrigemMetricas,
  papelVisivel,
  protocolosDaPessoa,
  recorteMetricas,
  resumoMetricas,
  tituloGrafico,
} from "@/lib/mesa-metricas";
import { intervaloDoPeriodo, PERIODO_TODO, rotuloPeriodo, textoIntervalo } from "@/lib/periodo";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import type { SituacaoCadastrada } from "@/lib/situacoes";
import { Avatar } from "./Avatar";
import type { AberturaMesa } from "./BannersMesa";
import { BarraMetricas } from "./BarraMetricas";
import { Button } from "./Button";
import { ChartCard } from "./ChartCard";
import { BarrasH, Colunas, type LinhaBarra } from "./charts/Barras";
import { ChartEmpty } from "./charts/shared";
import { type Column, DataTable } from "./DataTable";
import { IconInfo, IconUser } from "./icons";
import { KpiStat } from "./KpiStat";
import { OrigemDados } from "./OrigemDados";

/** Colunas da Data fora do período atual (a de hoje fica cheia, no accent). */
const COR_BALDE = "color-mix(in srgb, var(--accent) 58%, var(--surface))";
const plural = (n: number, um: string, varios: string) => `${num(n)} ${n === 1 ? um : varios}`;
const infoMedida = (m: MedidaMetricas) => MEDIDAS_METRICAS.find((x) => x.value === m) ?? MEDIDAS_METRICAS[0];
/** O número na medida, por extenso ("3 protocolos", "1 correção", "R$ 1.234,00"). */
const porExtenso = (m: MedidaMetricas, n: number) => (m === "valor" ? brl(n) : plural(n, infoMedida(m).um, infoMedida(m).varios));

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

/** A ORIGEM aberta: o que foi tocado + os protocolos (com o valor na medida) ou os eventos que formam aquele número. */
type Origem =
  | { quadro: string; rotulo: string; tipo: "protocolos"; medida: MedidaMetricas; lista: OrigemMetricas<ProtocoloPainel>[] }
  | { quadro: string; rotulo: string; tipo: "eventos"; evento: "reenvio" | "acao"; lista: EventoOrigem<ProtocoloPainel>[] };

/**
 * DASHBOARD DE GOVERNANÇA da Mesa (o ícone à esquerda de Protocolos · DFDs · Itens), SÓ sobre a execução da Mesa —
 * minimalista:
 * - KPIs — a Mesa AGORA (as listas com os filtros Responsável/Assunto do topo);
 * - a BARRA DE MÉTRICAS (período · dado · medida) + a linha do recorte;
 * - UM gráfico: o Dado escolhido (responsável, quem protocolou, natureza, tipo de DFD, situação, estado, unidade, tempo
 *   na Mesa ou data) na Medida escolhida (protocolos, DFDs, itens, valor, correções ou ações);
 * - o DESEMPENHO POR PESSOA (conformidade, correções, ações e tempo — como cada usuário está se saindo).
 * As métricas valem sobre o UNIVERSO (a Mesa com o Assunto do topo) com o Responsável do topo como FOCO: numa pessoa,
 * só ela — os mesmos números da linha dela na visão da equipe. Agregação PURA (`painelMesa` + `mesa-metricas`); toda
 * barra/linha abre a ORIGEM dos dados (Σ = o número).
 */
/** A grade das KPIs pelo NÚMERO delas (os detalhes do papel podem tirar algumas) — classes fixas do Tailwind. */
const COLUNAS_KPI: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" };

export function DashboardMesa({
  protocolos,
  dfds,
  universo,
  situacoes,
  pessoas,
  regras,
  responsavel,
  onAbrir,
  metricas,
  permitido = METRICAS_TODAS,
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
  /** O filtro de Responsável do topo — o FOCO das métricas. */
  responsavel: FiltroMesa["responsavel"];
  /** Abre o banner do protocolo de uma linha da ORIGEM dos dados (a pilha da Mesa). */
  onAbrir?: (a: AberturaMesa) => void;
  metricas: MetricasDashboard;
  /** O que os DETALHES do papel permitem (sem o dado oculto: o Dado, a Medida, as KPIs, o período e o desempenho por
   * pessoa somem) — sem = tudo. */
  permitido?: MetricasPermitidas;
}) {
  const { hoje } = metricas;
  // O filtro EFETIVO: um Dado/Medida/período que o papel não permite cai no primeiro permitido (ou em todo o período).
  const filtro = useMemo(() => {
    const f = metricas.filtro;
    return {
      periodo: permitido.periodo ? f.periodo : PERIODO_TODO,
      dado: permitido.dados.includes(f.dado) ? f.dado : (permitido.dados[0] ?? f.dado),
      medida: permitido.medidas.includes(f.medida) ? f.medida : (permitido.medidas[0] ?? f.medida),
    };
  }, [metricas.filtro, permitido]);
  const idDesempenho = useId();
  const [origem, setOrigem] = useState<Origem | null>(null);
  const [mostrada, setMostrada] = useState<Origem | null>(null); // fica exibida enquanto o banner fecha
  const abrirOrigem = (o: Origem) => {
    setOrigem(o);
    setMostrada(o);
  };
  // KPIs = a Mesa AGORA (todos os protocolos/DFDs em escopo), como sempre.
  const pMesa = useMemo(() => painelMesa({ protocolos, dfds }, new Date()), [protocolos, dfds]);
  // O RECORTE (período + foco no papel do Dado) — trocar o Dado dentro do mesmo papel ou a Medida só refaz o gráfico.
  const intervalo = useMemo(() => intervaloDoPeriodo(filtro.periodo, hoje), [filtro.periodo, hoje]);
  // Sem ver o Responsável, a pessoa das métricas é a Distribuição (a que o papel vê) — nunca um "Sem responsável" falso.
  const papel = papelVisivel(filtro.dado, permitido.responsavel);
  const rec = useMemo(
    () => recorteMetricas(universo.protocolos, universo.dfds, metricas.atividades, { intervalo, papel, hoje, foco: responsavel }),
    [universo, metricas.atividades, intervalo, papel, hoje, responsavel],
  );
  const grafico = useMemo(() => graficoMetricas(rec, filtro.dado, filtro.medida, situacoes), [rec, filtro.dado, filtro.medida, situacoes]);
  const desempenho = useMemo(() => desempenhoPorPessoa(rec), [rec]);
  const resumo = useMemo(() => resumoMetricas(rec), [rec]);
  const anos = useMemo(() => anosComDados(rec), [rec]);
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

  // ---- Pessoas e período ----
  const porDistribuicao = papel === "distribuicao";
  const rotuloDimensao = porDistribuicao ? "Quem protocolou" : "Responsável";
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
  // A janela à vista: o rótulo do seletor e, nos atalhos, as datas ("Este mês (01/09 a 30/09/2026)").
  const rotuloJanela = rotuloPeriodo(filtro.periodo);
  const janela = ["hoje", "semana", "mes"].includes(filtro.periodo.preset ?? "") ? `${rotuloJanela} (${textoIntervalo(intervalo)})` : rotuloJanela;
  // Onde nada foi achado: no período (com limites), no recorte (o foco do topo) ou na Mesa.
  const lugar = intervalo.de != null || intervalo.ate != null ? "no período" : responsavel !== "todos" ? "no recorte" : "na Mesa";
  const semNada = `Nenhum protocolo ${lugar}`;

  const estadoTag = (e: EstadoPainel) => (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-text-2">
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: cores[e] }} />
      {ROTULO_ESTADO_PAINEL[e]}
    </span>
  );
  const colunaNumero = <R,>(o: { value: (r: R) => string }): Column<R> => ({
    key: "numero",
    header: "Nº processo",
    nowrap: true,
    value: o.value,
    render: (r) => <span className="font-mono text-[12px] font-semibold">{o.value(r)}</span>,
  });
  const colunaNatureza = <R,>(protocolo: (r: R) => ProtocoloPainel): Column<R> => {
    const natureza = (r: R) => naturezaDoProtocolo(protocolo(r).assunto, protocolo(r).anoPca).rotulo;
    return { key: "natureza", header: "Natureza", nowrap: true, value: natureza, render: natureza };
  };
  // As origens: os PROTOCOLOS (a data, o processo, a natureza, a pessoa, o estado e — fora da medida Protocolos — o
  // valor na medida) ou os EVENTOS (reenvios/ações: a data, o processo, a natureza, quem fez e quantos).
  const colsProtocolos = (medida: MedidaMetricas): Column<OrigemMetricas<ProtocoloPainel>>[] => [
    { key: "data", header: "Protocolação", nowrap: true, filter: "date", value: (o) => diaDoProtocolo(o.protocolo.criadoEm) ?? "", render: (o) => dataBR(diaDoProtocolo(o.protocolo.criadoEm)) },
    colunaNumero<OrigemMetricas<ProtocoloPainel>>({ value: (o) => o.protocolo.numero ?? "—" }),
    colunaNatureza<OrigemMetricas<ProtocoloPainel>>((o) => o.protocolo),
    // A pessoa só com o dado dela à vista (os detalhes do papel podem ocultar o Responsável ou a Distribuição).
    ...((porDistribuicao ? permitido.distribuicao : permitido.responsavel)
      ? [
          {
            key: "pessoa",
            header: rotuloDimensao,
            align: "left" as const,
            nowrap: true,
            value: (o: OrigemMetricas<ProtocoloPainel>) => nomePessoa(porDistribuicao ? (o.protocolo.distribuidorId ?? null) : o.protocolo.responsavelId),
            render: (o: OrigemMetricas<ProtocoloPainel>) => rotuloPessoa(porDistribuicao ? (o.protocolo.distribuidorId ?? null) : o.protocolo.responsavelId),
          },
        ]
      : []),
    ...(permitido.kpiConformidade
      ? [
          {
            key: "estado",
            header: "Estado",
            nowrap: true,
            value: (o: OrigemMetricas<ProtocoloPainel>) => ROTULO_ESTADO_PAINEL[o.protocolo.estado],
            render: (o: OrigemMetricas<ProtocoloPainel>) => estadoTag(o.protocolo.estado),
          },
        ]
      : []),
    ...(medida === "protocolos"
      ? []
      : [
          {
            key: "medida",
            header: infoMedida(medida).label,
            align: medida === "valor" ? ("right" as const) : ("center" as const),
            nowrap: true,
            filter: "range" as const,
            numero: (o: OrigemMetricas<ProtocoloPainel>) => o.valor,
            formatarFaixa: medida === "valor" ? undefined : (n: number) => num(n),
            render: (o: OrigemMetricas<ProtocoloPainel>) => <span className="font-semibold tabular-nums">{medida === "valor" ? brl(o.valor) : num(o.valor)}</span>,
          },
        ]),
  ];
  const colsEventos = (evento: "reenvio" | "acao"): Column<EventoOrigem<ProtocoloPainel>>[] => [
    { key: "data", header: evento === "reenvio" ? "Reenvio" : "Data", nowrap: true, filter: "date", value: (c) => c.dia, render: (c) => dataBR(c.dia) },
    colunaNumero<EventoOrigem<ProtocoloPainel>>({ value: (c) => c.protocolo.numero ?? "—" }),
    colunaNatureza<EventoOrigem<ProtocoloPainel>>((c) => c.protocolo),
    // Quem fez só com o desempenho por pessoa (sem ele, o servidor nem manda quem foi).
    ...(permitido.desempenho
      ? [
          {
            key: "quem",
            header: evento === "reenvio" ? "Reenviado por" : "Feita por",
            align: "left" as const,
            nowrap: true,
            value: (c: EventoOrigem<ProtocoloPainel>) => (c.usuarioId != null ? nomePessoa(c.usuarioId) : "—"),
            render: (c: EventoOrigem<ProtocoloPainel>) => (c.usuarioId != null ? rotuloPessoa(c.usuarioId) : "—"),
          },
        ]
      : []),
    { key: "n", header: evento === "reenvio" ? "Reenvios" : "Ações", nowrap: true, filter: "range", numero: (c) => c.n, formatarFaixa: (n) => num(n), render: (c) => num(c.n) },
  ];

  // ---- O gráfico ----
  const titulo = tituloGrafico(filtro.dado, filtro.medida, grafico.granularidade);
  const deEvento = medidaDeEvento(filtro.medida);
  const nomeLinha = (l: LinhaGrafico) => (l.pessoaId !== undefined ? nomePessoa(l.pessoaId) : l.titulo);
  const abrirLinha = (l: LinhaGrafico) => {
    if (l.valor === 0) return;
    const o = grafico.origem([l.chave]);
    const rotulo = `${nomeLinha(l)} · ${janela}`;
    abrirOrigem(o.tipo === "eventos" ? { quadro: titulo, rotulo, tipo: "eventos", evento: o.evento, lista: o.lista } : { quadro: titulo, rotulo, tipo: "protocolos", medida: filtro.medida, lista: o.lista });
  };
  const formatar = (n: number) => (filtro.medida === "valor" ? brlCompact(n) : num(n));
  const corDaLinha = (l: LinhaGrafico) =>
    filtro.dado === "estado"
      ? cores[l.chave as EstadoPainel]
      : filtro.dado === "situacao" && l.chave !== "sem"
        ? (situacaoPorId.get(Number(l.chave))?.cor ?? "var(--faint)")
        : l.apagada
          ? "var(--faint)"
          : "var(--accent)";
  const linhasBarras: LinhaBarra[] = grafico.linhas.map((l) => {
    const pessoa = l.pessoaId != null ? pessoas.get(l.pessoaId) : undefined;
    const nome = nomeLinha(l);
    return {
      chave: l.chave,
      rotulo:
        l.pessoaId !== undefined ? (
          rotuloPessoa(l.pessoaId)
        ) : filtro.dado === "unidade" && !l.apagada ? (
          <span className="font-mono text-[12px] font-semibold">{l.rotulo}</span>
        ) : (
          l.rotulo
        ),
      titulo: `${pessoa && pessoa.nome !== nome ? `${nome} — ${pessoa.nome}` : nome}: ${porExtenso(filtro.medida, l.valor)}`,
      segmentos: [{ chave: "v", valor: l.valor, cor: corDaLinha(l), rotulo: infoMedida(filtro.medida).label }],
      valor: formatar(l.valor),
      detalhe: grafico.total > 0 && l.valor !== 0 ? pct(l.valor, grafico.total) : undefined,
      // A barra zerada fica esmaecida e não abre a origem (não há o que listar).
      apagada: l.apagada || l.valor === 0,
      clicavel: l.valor !== 0,
    };
  });
  // Nada na MEDIDA (os protocolos podem existir e somar zero nela — ex.: DFDs sem valor): a mensagem diz o quê.
  const vazioMedida: Record<MedidaMetricas, string> = {
    protocolos: semNada,
    dfds: `Nenhum DFD ${lugar}`,
    itens: `Nenhum item ${lugar}`,
    valor: `Sem valor ${lugar}`,
    correcoes: `Nenhuma correção ${lugar}`,
    acoes: `Nenhuma ação ${lugar}`,
  };
  // O que fica no lugar das barras (o histórico carregando ou indisponível, ninguém de quem contar ações, nada na medida)
  // — sem barras, sem a dica de tocar numa.
  const semBarras: ReactNode =
    deEvento && metricas.atividades == null ? (
      metricas.erro ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-[12.5px] text-muted">
          Histórico indisponível
          <Button variant="secondary" size="sm" onClick={metricas.onTentar}>
            Tentar de novo
          </Button>
        </div>
      ) : (
        <ChartEmpty label="Carregando o histórico…" />
      )
    ) : filtro.medida === "acoes" && rec.semAtores ? (
      <ChartEmpty label="Sem responsável: as ações são de quem as fez — escolha “Todos” ou uma pessoa no topo" />
    ) : grafico.total === 0 && grafico.fora === 0 ? (
      <ChartEmpty label={vazioMedida[filtro.medida]} />
    ) : null;
  const corpoGrafico = (): ReactNode => {
    if (semBarras) return semBarras;
    if (filtro.dado === "data")
      return (
        <Colunas
          ariaLabel={titulo}
          formatar={formatar}
          // O valor em cada coluna só quando cabe (o R$ é largo); senão, o maior e o último — os demais na dica.
          rotularTodas={grafico.linhas.length <= (filtro.medida === "valor" ? 4 : 7)}
          onEscolher={(k) => {
            const l = grafico.linhas.find((x) => x.chave === k);
            if (l) abrirLinha(l);
          }}
          colunas={grafico.linhas.map((l) => ({
            chave: l.chave,
            rotulo: l.rotulo,
            valor: l.valor,
            cor: l.atual ? "var(--accent)" : COR_BALDE,
            dica: { valor: porExtenso(filtro.medida, l.valor), rotulo: `${l.titulo}${l.atual ? " (atual)" : ""}` },
          }))}
        />
      );
    return (
      <BarrasH
        ariaLabel={titulo}
        linhas={linhasBarras}
        acao="ver a origem dos dados"
        onEscolher={(k) => {
          const l = grafico.linhas.find((x) => String(x.chave) === String(k));
          if (l) abrirLinha(l);
        }}
      />
    );
  };
  const notas = [
    grafico.fora > 0 ? `Fora do gráfico (sem data de protocolação): ${porExtenso(filtro.medida, grafico.fora)}.` : null,
    grafico.repete ? `Um protocolo com DFDs de ${filtro.dado === "tipo" ? "tipos" : "unidades"} diferentes conta em cada barra; o total conta uma vez.` : null,
  ].filter((n): n is string => n != null);

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

  // ---- KPIs (a Mesa agora) ----
  const totalMesa = pMesa.protocolos;
  const conferindoMesa = pMesa.saude.conferindo;
  const naoConferidosMesa = pMesa.saude.naoConferido;
  const conferidosMesa = totalMesa - conferindoMesa - naoConferidosMesa;
  const falhasMesa = naoConferidosMesa > 0 ? ` · ${plural(naoConferidosMesa, "não conferido", "não conferidos")}` : "";
  const corSaudeMesa = pMesa.saude.erro > 0 ? cores.erro : pMesa.saude.atencao > 0 ? cores.atencao : cores.regular;
  const picoSemana = Math.max(0, ...pMesa.semanas);
  const nKpis = 1 + [permitido.kpiValor, permitido.kpiConformidade, permitido.responsavel, permitido.kpiTempo].filter(Boolean).length;

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
      {permitido.desempenho && resumo.acoes != null && ` · ${plural(resumo.acoes, "ação", "ações")}`}
    </span>
  );
  const linhaRecorte = (
    <>
      <span>
        <strong className="font-semibold text-text-2">{janela}</strong> · {plural(resumo.protocolos, "protocolo", "protocolos")} ·{" "}
        {plural(resumo.dfds, "DFD", "DFDs")} · {plural(resumo.itens, "item", "itens")}
        {permitido.kpiValor && ` · ${brlCompact(resumo.valor)}`}
      </span>
      {execucao}
    </>
  );
  // O FOCO do topo: a pessoa no PAPEL do Dado (os números = a linha da pessoa na visão da equipe).
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

  const totalOrigem = (o: Origem) =>
    o.tipo === "eventos" ? o.lista.reduce((t, c) => t + c.n, 0) : o.medida === "protocolos" ? o.lista.length : o.lista.reduce((t, x) => t + x.valor, 0);

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className={`grid grid-cols-2 gap-[var(--gap-block)] ${COLUNAS_KPI[nKpis] ?? "lg:grid-cols-5"}`}>
        <div className="col-span-2 lg:col-span-1">
          <KpiStat
            label="Protocolos na Mesa"
            value={num(totalMesa)}
            hint={`${plural(pMesa.dfds, "DFD", "DFDs")} · ${plural(pMesa.itens, "item", "itens")}`}
            spark={permitido.kpiTempo && picoSemana > 0 ? pMesa.semanas.map((n) => (n / picoSemana) * 100) : undefined}
          />
        </div>
        {permitido.kpiValor && <KpiStat label="Valor na Mesa" value={brlCompact(pMesa.valor)} cor="var(--sit-finalizado)" hint="somatória dos DFDs" />}
        {permitido.kpiConformidade && (
        <KpiStat
          label="Conformidade"
          value={conferidosMesa > 0 ? pct(pMesa.saude.regular, conferidosMesa) : "—"}
          cor={corSaudeMesa}
          hint={
            conferindoMesa > 0
              ? `conferindo ${num(conferidosMesa)} de ${num(totalMesa)}…${falhasMesa}`
              : naoConferidosMesa > 0
                ? `${num(naoConferidosMesa)} não conferido${naoConferidosMesa === 1 ? "" : "s"} · ${num(pMesa.saude.erro)} com erro`
                : `${num(pMesa.saude.erro)} com erro · ${num(pMesa.saude.atencao)} em atenção`
          }
        />
        )}
        {permitido.responsavel && (
          <KpiStat
            label="Com responsável"
            value={totalMesa > 0 ? pct(totalMesa - pMesa.semResponsavel, totalMesa) : "—"}
            cor={pMesa.semResponsavel > 0 ? "var(--warn)" : "var(--ok)"}
            hint={pMesa.semResponsavel > 0 ? `${num(pMesa.semResponsavel)} sem responsável` : "todos com responsável"}
          />
        )}
        {permitido.kpiTempo && (
          <KpiStat
            label="Tempo médio na Mesa"
            value={pMesa.diasMedio == null ? "—" : plural(Math.round(pMesa.diasMedio), "dia", "dias")}
            cor="var(--sit-devolvido)"
            hint={pMesa.acimaAlerta > 0 ? `${num(pMesa.acimaAlerta)} há mais de ${DIAS_ALERTA} dias` : `nenhum há mais de ${DIAS_ALERTA} dias`}
          />
        )}
      </div>

      <BarraMetricas
        filtro={filtro}
        onFiltro={metricas.onFiltro}
        anos={anos}
        resumo={linhaRecorte}
        aviso={aviso}
        dados={permitido.dados}
        medidas={permitido.medidas}
        periodo={permitido.periodo}
      />

      <ChartCard
        title={titulo}
        subtitle={semBarras ? janela : `${janela} · toque numa barra para ver a origem`}
        action={
          grafico.total > 0 ? (
            <span className="whitespace-nowrap text-[12px] font-semibold text-text-2 tabular-nums">
              {filtro.medida === "valor" ? brlCompact(grafico.total) : porExtenso(filtro.medida, grafico.total)}
            </span>
          ) : undefined
        }
      >
        {/* Trocar o Dado replaya o morph (fade + escala) — o MESMO gráfico mostrando outro dado. */}
        <div key={filtro.dado} className="animate-cat-morph">
          {corpoGrafico()}
          {notas.length > 0 && (
            <div className="mt-2 space-y-0.5 text-[11.5px] text-muted">
              {notas.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          )}
        </div>
      </ChartCard>

{permitido.desempenho && (papel === "distribuicao" ? permitido.distribuicao : permitido.responsavel) && (
      <section aria-labelledby={idDesempenho} className="space-y-2">
        <div>
          <h3 id={idDesempenho} className="text-sm font-semibold text-text">
            Desempenho por pessoa
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {rotuloDimensao} · {janela} — conformidade, correções, ações e tempo na Mesa; toque numa linha para ver os protocolos.
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
              rotulo: `${nomePessoa(l.pessoaId)} · ${janela}`,
              tipo: "protocolos",
              medida: "valor",
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
)}

      <OrigemDados
        aberto={origem != null}
        onClose={() => setOrigem(null)}
        titulo={mostrada?.quadro ?? ""}
        recorte={mostrada?.rotulo ?? ""}
        resumo={
          mostrada?.tipo === "eventos"
            ? [
                { label: mostrada.evento === "reenvio" ? "Reenvios" : "Ações", value: num(totalOrigem(mostrada)) },
                { label: "Protocolos", value: num(new Set(mostrada.lista.map((c) => c.protocolo.id)).size) },
              ]
            : [
                { label: "Protocolos", value: num(mostrada?.lista.length ?? 0) },
                ...(mostrada && mostrada.medida !== "protocolos"
                  ? [{ label: infoMedida(mostrada.medida).label, value: mostrada.medida === "valor" ? brl(totalOrigem(mostrada)) : num(totalOrigem(mostrada)) }]
                  : []),
              ]
        }
        fonte={
          mostrada?.tipo === "eventos"
            ? mostrada.evento === "reenvio"
              ? "O histórico dos protocolos do recorte (a Mesa com o Assunto do topo; com uma pessoa no Responsável do topo, só os protocolos dela): cada reenvio (o processo devolvido que volta corrigido), pela data em que foi reenviado."
              : "O histórico da Mesa (os protocolos com o Assunto do topo): as ações de execução de quem conta no recorte (com uma pessoa no Responsável do topo, só as dela), pela data em que foram feitas."
            : "Os protocolos do recorte (a Mesa com o Assunto do topo; com uma pessoa no Responsável do topo, só os dela) protocolados no período (dia de Brasília); DFDs, itens e valor pelos DFDs de cada um — em tipo de DFD e unidade, só os do grupo tocado."
        }
      >
        {mostrada?.tipo === "eventos" ? (
          <DataTable
            columns={colsEventos(mostrada.evento)}
            rows={mostrada.lista}
            getKey={(c) => `${c.protocolo.id}:${c.dia}:${c.usuarioId ?? ""}`}
            pageSize={20}
            minWidth={680}
            onRowClick={onAbrir ? (c) => onAbrir({ tipo: "protocolo", id: c.protocolo.id }) : undefined}
            resumo={(ls) => plural(ls.reduce((t, c) => t + c.n, 0), mostrada.evento === "reenvio" ? "reenvio" : "ação", mostrada.evento === "reenvio" ? "reenvios" : "ações")}
          />
        ) : (
          <DataTable
            columns={colsProtocolos(mostrada?.medida ?? "protocolos")}
            rows={mostrada?.lista ?? []}
            getKey={(o) => o.protocolo.id}
            pageSize={20}
            minWidth={760}
            onRowClick={onAbrir ? (o) => onAbrir({ tipo: "protocolo", id: o.protocolo.id }) : undefined}
            resumo={(ls) =>
              `${plural(ls.length, "protocolo", "protocolos")}${
                mostrada && mostrada.medida !== "protocolos" ? ` · ${porExtenso(mostrada.medida, ls.reduce((t, o) => t + o.valor, 0))}` : ""
              }`
            }
          />
        )}
      </OrigemDados>
    </div>
  );
}
