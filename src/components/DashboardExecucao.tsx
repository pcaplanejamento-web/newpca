"use client";

import dynamic from "next/dynamic";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { EmpenhoNaTela } from "@/lib/empenhos-tela-core";
import {
  anosDoIntervalo,
  mesesComDados,
  type BaseExec,
  type Calculo,
  calcular,
  confianca,
  DIMS_EXEC,
  derivados,
  type DimDemonstrativo,
  type DimExec,
  demonstrativo,
  type LinhaDemonstrativo,
  selecaoDaLinha,
  type EmpenhoExec,
  type EventoExec,
  empenhoExec,
  type FiltrosExec,
  type Granularidade,
  liquidacaoExec,
  OPCOES_TIPO,
  opcoesDim,
  pagamentoExec,
  reais,
  resumoSelecao,
  ROTULO_DIM,
  saldoEtapa,
  rotuloOpcao,
  type Selecao,
  selecaoNoIntervalo,
  deslocarJanela,
  diaDoIso,
  MIN_DIAS_ZOOM,
  zoomJanela,
  type TipoFiltroExec,
  serie,
  sparks,
} from "@/lib/execucao-dash-core";
import { brl, dataBR, dataHoraBR, num } from "@/lib/format";
import { intervaloDoPeriodo, type Periodo, PERIODO_TODO, rotuloPeriodo, textoIntervalo } from "@/lib/periodo";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Avisos } from "./Avisos";
import { Button } from "./Button";
import { CelulaCopiavel } from "./BotaoCopiar";
import { CelulaTexto } from "./CelulaLista";
import { ChartCard } from "./ChartCard";
import { BarraSegmentada, BarrasH, type LinhaBarra, type Segmento } from "./charts/Barras";
import type { LinhaDica, PontoTemporal } from "./charts/SerieTemporal";
import { corSerie } from "./charts/shared";
import { type Column, DataTable, FiltrosAtivos } from "./DataTable";
import { usePaineisEmpenho } from "./EmpenhoDetalhe";
import { ErroCarga } from "./ErroCarga";
import { FiltrosDashboard } from "./FiltrosDashboard";
import { IconChevronDown, IconChevronLeft, IconClose, IconChevronRight, IconDatabase, IconInfo, IconLayers, IconRestaurar, IconZoom, IconZoomOut } from "./icons";
import { KpiStat } from "./KpiStat";
import { duracaoMotionMs } from "./Modal";
import { OrigemDados } from "./OrigemDados";
import { PeriodoPicker } from "./PeriodoPicker";
import { SelectField } from "./Field";
import { Segmented } from "./Segmented";
import { Skeleton } from "./Skeleton";
import { useContagem } from "./useContagem";

// O gráfico (Recharts) só chega com a tela: a mesma altura enquanto o código é baixado.
const SerieTemporal = dynamic(() => import("./charts/SerieTemporal").then((m) => m.SerieTemporal), {
  ssr: false,
  loading: () => <Skeleton className="h-[360px] w-full rounded-card" />,
});

/** As séries (as cores `--serie-*`: as mesmas dos indicadores e do demonstrativo). */
const SERIES = [
  { chave: "empenhado", rotulo: "Empenhado", cor: 0 },
  { chave: "liquidado", rotulo: "Liquidado", cor: 1 },
  { chave: "pago", rotulo: "Pago", cor: 7 },
] as const;
const COR = { empenhado: corSerie(SERIES[0].cor), liquidado: corSerie(SERIES[1].cor), pago: corSerie(SERIES[2].cor) };

/** A largura da pilha de botões sobre o desenho (botão + vidro + a distância da borda): as datas não entram nela. */
const RESERVA_CONTROLES = 60;

/** Da mais fina à mais grossa (a granularidade do zoom nunca fica mais grossa que a escolhida). */
const ORDEM_GRAN = { auto: 0, dia: 1, semana: 2, mes: 3, ano: 4 } as const;

/** O "vidro" dos controles SOBRE o desenho do gráfico: a superfície translúcida, desfocada, com o anel. */
/** O cartão do gráfico. O corte arredondado é feito pelo `clip-path` (e o `isolate`), não só pelo `overflow-hidden`: as camadas
 * que o navegador compõe à parte — o vidro com desfoque, as pílulas das datas, as animações de opacidade — escapavam do
 * raio depois de sair da tela e voltar (as pontas do desenho ficavam retas). */
const CARTAO_GRAFICO = "relative isolate overflow-hidden rounded-card bg-surface-2/60 [clip-path:inset(0_round_var(--radius-card))]";
const VIDRO = "vidro-controles rounded-[calc(var(--radius-control)+4px)] bg-surface/55 p-1 shadow-ring backdrop-blur-md";

/** A escala dos controles sobre o desenho em telas menores (`zoom` reduz também o espaço que ocupam). */
const ESCALA_CONTROLES = "max-lg:[zoom:0.9] max-sm:[zoom:0.8]";
/** A pilha lateral (lupa, restaurar, tabela) encolhe mais: no celular cobriria boa parte da altura do desenho. */
const ESCALA_PILHA = "max-lg:[zoom:0.85] max-sm:[zoom:0.7]";

type Aba = "empenhos" | "liquidacoes" | "pagamentos";
/** Um recorte da origem: o texto e os registros. */
type RecorteOrigem = { recorte: string; sel: Selecao };
/** A origem de um número; com `acumulado`, a do ponto do gráfico também oferece "Acumulado até aqui" (`noAcumulado` = abre nele). */
type Origem = RecorteOrigem & { titulo: string; aba: Aba; acumulado?: RecorteOrigem & { pontos: PontoDaSerie[]; ajustarY: boolean }; noAcumulado?: boolean };

const CHAVE_MAIS = "execucao:mais-indicadores";
const lerMais = () => {
  try {
    return localStorage.getItem(CHAVE_MAIS) === "1";
  } catch {
    return false;
  }
};

const pctTexto = (p: number | null) => (p == null ? "—" : `${(p * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const plural = (n: number, um: string, varios: string) => `${num(n)} ${n === 1 ? um : varios}`;
/** Os sparks em % do maior (o `KpiStat` desenha alturas de 0 a 100). */
const emPct = (l: number[]) => {
  const m = Math.max(0, ...l);
  return m > 0 ? l.map((v) => (v / m) * 100) : l.map(() => 0);
};

/** O empenho da base no formato do banner (`EmpenhoDetalhe`; o CPF/CNPJ não vem no pacote — o banner o lê do registro). */
const paraTela = (e: EmpenhoExec): EmpenhoNaTela => ({ ...e, cpfCnpj: null });

/**
 * O DASHBOARD DA EXECUÇÃO (corpo da tela): os indicadores (saldo; anulado e total em "Mais indicadores"); o cartão dos
 * filtros (o Período, o Tipo e as dimensões, conectados); o gráfico (as ondas, acumulado ou por período) com o funil dos
 * filtros ligados, o (!) e o (?); e o demonstrativo. TODO número sai do núcleo (`execucao-dash-core.ts` — `calcular`), com
 * a ORIGEM de cada um (a soma da lista = o número).
 */
export function DashboardExecucao({
  base,
  anos,
  onAnos,
  carregando,
  erro,
  onTentar,
  hoje,
  podeExportar,
}: {
  base: BaseExec;
  anos: number[];
  onAnos: (l: number[]) => void;
  carregando: boolean;
  erro: string | null;
  onTentar: () => void;
  hoje: string;
  podeExportar: boolean;
}) {
  // O Período abre no ano mais recente com dados (os anos carregados seguem o Período — `anosDoIntervalo`).
  const periodoPadrao = useMemo<Periodo>(() => (base.anos[0] ? { ano: base.anos[0] } : PERIODO_TODO), [base.anos]);
  const [periodo, setPeriodo] = useState<Periodo>(periodoPadrao);
  const [filtros, setFiltros] = useState<FiltrosExec>({});
  const [tipo, setTipo] = useState<TipoFiltroExec>([]);
  const [modo, setModo] = useState<"diario" | "acumulado">("acumulado");
  const [gran, setGran] = useState<Granularidade>("dia");
  const [mais, setMais] = useState(false);
  /** A abertura terminou (só então os cartões podem passar da borda — a sombra, o realce). */
  const [maisPronto, setMaisPronto] = useState(false);
  const [animarMais, setAnimarMais] = useState(false);
  const [verDados, setVerDados] = useState(false);
  const [origem, setOrigem] = useState<Origem | null>(null);
  useEffect(() => {
    // A preferência guardada abre já pronta, sem animar na chegada.
    const v = lerMais();
    setMais(v);
    setMaisPronto(v);
  }, []);

  // Os filtros mudam na hora; o cálculo segue um quadro depois (a tela não trava com centenas de milhares de registros).
  const pedido = useMemo(() => ({ periodo, filtros, tipo }), [periodo, filtros, tipo]);
  const adiado = useDeferredValue(pedido);
  const atrasado = adiado !== pedido || carregando;
  const intervalo = useMemo(() => intervaloDoPeriodo(adiado.periodo, hoje), [adiado.periodo, hoje]);
  const calc: Calculo = useMemo(() => calcular(base, intervalo, adiado.filtros, adiado.tipo), [base, intervalo, adiado.filtros, adiado.tipo]);
  // Os ANOS a carregar seguem o Período (o Ano não é um filtro à parte): mudou o que o Período cobre, pede os anos dele.
  // Os meses que o seletor de período oferece: os com registro nos anos carregados.
  const meses = useMemo(() => mesesComDados(base), [base]);
  const anosQuer = useMemo(() => anosDoIntervalo(intervaloDoPeriodo(periodo, hoje), base.disponiveis), [periodo, hoje, base.disponiveis]);
  useEffect(() => {
    if (anosQuer.join(",") !== anos.join(",")) onAnos(anosQuer);
  }, [anosQuer, anos, onAnos]);
  const t = calc.totais;
  const d = derivados(t);
  const sp = useMemo(() => sparks(base, calc.sel, hoje), [base, calc.sel, hoje]);
  // O gráfico do PERÍODO inteiro (a base do zoom, da origem acumulada e da parte alcançada).
  const sTodo = useMemo(() => serie(base, calc, intervalo, gran, hoje), [base, calc, intervalo, gran, hoje]);
  // ZOOM pela lupa = uma JANELA DE DATAS do período: a série é refeita nela, na granularidade dela (um ano em meses vira
  // semanas e depois dias), com os acumulados continuando do início do período. Outro período volta ao todo.
  const [janela, setJanela] = useState<{ de: string; ate: string } | null>(null);
  const todo = sTodo.de && sTodo.ate ? { de: sTodo.de, ate: sTodo.ate } : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: o zoom volta ao todo quando o período do gráfico muda.
  useEffect(() => setJanela(null), [sTodo.de, sTodo.ate]);
  const s = useMemo(
    () => {
      if (!janela) return sTodo;
      // Na janela, a granularidade pedida ou uma MAIS FINA quando a janela é curta (um mês em meses seria um ponto só).
      const opc = { acumularDesde: sTodo.pontos[0]?.de };
      const auto = serie(base, calc, janela, "auto", hoje, opc);
      return ORDEM_GRAN[auto.granularidade] <= ORDEM_GRAN[gran] ? auto : serie(base, calc, janela, gran, hoje, opc);
    },
    [janela, base, calc, hoje, sTodo, gran],
  );
  const conf = useMemo(() => confianca(base.meta, base.fontes, Date.now()), [base.meta, base.fontes]);
  const temLiq = base.fontes.liquidacoes;
  const temPag = base.fontes.pagamentos;

  const empenhadoAnim = useContagem(reais(t.empenhado));
  const liquidadoAnim = useContagem(reais(t.liquidado));
  const pagoAnim = useContagem(reais(t.pago));

  // O TIPO é um filtro como os demais (o mesmo seletor), com as opções conectadas aos outros filtros.
  const campos = useMemo(
    () => [
      {
        dim: "tipo",
        rotulo: "Tipo",
        opcoes: OPCOES_TIPO.map((o) => ({ chave: o.chave, rotulo: o.rotulo, count: calc.opcoesTipo.get(o.chave) ?? 0 })),
        selecionados: [...tipo],
      },
      ...DIMS_EXEC.map((dim) => ({
        dim,
        rotulo: ROTULO_DIM[dim],
        opcoes: opcoesDim(base, calc, adiado.filtros, dim),
        selecionados: [...(filtros[dim] ?? [])],
      })),
    ],
    [base, calc, adiado.filtros, filtros, tipo],
  );
  const mudarFiltro = (dim: string, chaves: string[]) => {
    if (dim === "tipo") return setTipo(chaves.filter((k): k is "ne" | "rp" => k === "ne" || k === "rp"));
    setFiltros((f) => {
      const n = { ...f };
      if (chaves.length) n[dim as DimExec] = chaves;
      else delete n[dim as DimExec];
      return n;
    });
  };
  const periodoMudou = JSON.stringify(periodo) !== JSON.stringify(periodoPadrao);
  const limparTudo = () => {
    setFiltros({});
    setPeriodo(periodoPadrao);
    setTipo([]);
  };
  /** Os filtros ligados (fora do padrão), um por linha no resumo: o período, o tipo e cada dimensão com os valores. */
  const ativosResumo: { key: string; rotulo: string; valor: string; tirar: () => void }[] = [
    ...(periodoMudou ? [{ key: "periodo", rotulo: "Período", valor: rotuloPeriodo(periodo), tirar: () => setPeriodo(periodoPadrao) }] : []),
    ...(tipo.length ? [{ key: "tipo", rotulo: "Tipo", valor: OPCOES_TIPO.filter((o) => tipo.includes(o.chave)).map((o) => o.rotulo).join(", "), tirar: () => setTipo([]) }] : []),
    ...DIMS_EXEC.flatMap((dim) => {
      const l = filtros[dim] ?? [];
      return l.length ? [{ key: `d:${dim}`, rotulo: ROTULO_DIM[dim], valor: l.map((k) => rotuloOpcao(base, dim, k)).join(", "), tirar: () => mudarFiltro(dim, []) }] : [];
    }),
  ];

  const pontos: PontoTemporal[] = useMemo(
    () =>
      s.pontos.map((p) => ({
        chave: p.chave,
        rotulo: p.rotulo,
        titulo: p.titulo,
        atual: p.atual,
        t: tDoBalde(p),
        valores:
          modo === "acumulado"
            ? { empenhado: reais(p.acEmpenhado), liquidado: reais(p.acLiquidado), pago: reais(p.acPago) }
            : { empenhado: reais(p.empenhado), liquidado: reais(p.liquidado), pago: reais(p.pago) },
      })),
    [s.pontos, modo],
  );
  const zoom = (fator: number) => todo && setJanela((j) => zoomJanela(j, todo, fator));
  // As datas que o gráfico MOSTRA no zoom: o início da janela até o fim dela (nunca depois de hoje nem do último dado).
  const janelaVista = useMemo(() => {
    if (!janela) return { de: "", ate: "", dias: 0 };
    const fim = [janela.ate, hoje, s.pontos.at(-1)?.ate ?? janela.ate].sort()[0];
    return { de: janela.de, ate: fim, dias: (diaDoIso(fim) ?? 0) - (diaDoIso(janela.de) ?? 0) + 1 };
  }, [janela, hoje, s.pontos]);
  const diasJanela = janela ? (diaDoIso(janela.ate) ?? 0) - (diaDoIso(janela.de) ?? 0) + 1 : Number.POSITIVE_INFINITY;
  const seriesVistas = useMemo(() => SERIES.filter((x) => (x.chave === "liquidado" ? temLiq : x.chave === "pago" ? temPag : true)), [temLiq, temPag]);
  // As linhas que a pessoa desligou na legenda (só na tela); ao menos uma fica sempre à vista.
  const [ocultas, setOcultas] = useState<ReadonlySet<string>>(() => new Set());
  const seriesDesenho = useMemo(() => {
    const v = seriesVistas.filter((x) => !ocultas.has(x.chave));
    return v.length ? v : seriesVistas;
  }, [seriesVistas, ocultas]);
  const rotuloGran = { dia: "dia", semana: "semana", mes: "mês", ano: "ano" }[s.granularidade];

  const recorteTexto = [
    rotuloPeriodo(adiado.periodo) + (intervalo.de || intervalo.ate ? ` (${textoIntervalo(intervalo)})` : ""),
    ...(tipo.length === 1 ? [tipo[0] === "ne" ? "Nota de Empenho" : "Restos a Pagar"] : []),
  ].join(" · ");

  // Tudo o que antes empurrava a tela (atualização, alertas da importação, registros sem empenho) fica no (!).
  const avisos = [
    { id: "atualizado", tom: conf.atualizado ? ("info" as const) : ("warn" as const), texto: conf.atualizado ? `Dados da Centi importados até ${dataHoraBR(conf.atualizado)}.` : "Nenhuma importação concluída." },
    ...conf.avisos.map((a) => ({ id: a, tom: "warn" as const, texto: a })),
    ...(t.semEmpenho
      ? [{ id: "sem-empenho", tom: "warn" as const, texto: `${plural(t.semEmpenho, "liquidação ou pagamento", "liquidações e pagamentos")} sem o empenho no sistema (${brl(reais(t.semEmpenhoValor))}) — contados como Restos a Pagar.` }]
      : []),
    ...(temLiq || temPag
      ? [{ id: "restos", tom: "info" as const, texto: "O liquidado e o pago incluem os restos a pagar — por isso podem passar do empenhado. Use o filtro Tipo para separar Nota de Empenho e Restos a Pagar." }]
      : []),
  ];

  const abrirOrigem = (titulo: string, recorte: string, sel: Selecao, aba: Aba) => setOrigem({ titulo, recorte, sel, aba });
  const abrirTudo = (aba: Aba, titulo: string) => abrirOrigem(titulo, recorteTexto, calc.sel, aba);
  const pontoPorChave = useMemo(() => new Map(s.pontos.map((p) => [p.chave, p])), [s.pontos]);
  /** A origem de um ponto: o balde e o acumulado desde o início do gráfico até ele (o que o gráfico acumulado mostra). */
  const abrirPonto = (chave: string) => {
    const pt = pontoPorChave.get(chave);
    const inicio = sTodo.pontos[0]?.de;
    if (!pt || !inicio) return;
    setOrigem({
      titulo: modo === "acumulado" ? "Evolução acumulada" : `Valores por ${rotuloGran}`,
      recorte: pt.titulo,
      sel: selecaoNoIntervalo(base, calc.sel, pt.de, pt.ate),
      aba: "empenhos",
      acumulado: {
        recorte: `Até ${pt.titulo}`,
        sel: selecaoNoIntervalo(base, calc.sel, inicio, pt.ate),
        // A evolução até o ponto (os pontos do gráfico à vista, em valores acumulados).
        pontos: s.pontos.slice(0, s.pontos.indexOf(pt) + 1),
        ajustarY: !!janela,
      },
      noAcumulado: modo === "acumulado",
    });
  };

  /** A origem de um TRECHO do gráfico (do início do 1º balde ao fim do 2º) e o acumulado até o fim dele. */
  const abrirTrecho = (de: string, ate: string) => {
    const pa = pontoPorChave.get(de);
    const pb = pontoPorChave.get(ate);
    const inicio = sTodo.pontos[0]?.de;
    if (!pa || !pb || !inicio) return;
    setOrigem({
      titulo: "Trecho do gráfico",
      recorte: `${pa.titulo} a ${pb.titulo}`,
      sel: selecaoNoIntervalo(base, calc.sel, pa.de, pb.ate),
      aba: "empenhos",
      acumulado: { recorte: `Até ${pb.titulo}`, sel: selecaoNoIntervalo(base, calc.sel, inicio, pb.ate), pontos: s.pontos.slice(0, s.pontos.indexOf(pb) + 1), ajustarY: !!janela },
    });
  };

  return (
    <div className={`space-y-[var(--gap-block)] transition-opacity ${atrasado ? "opacity-70" : ""}`} aria-busy={atrasado}>
      {/* Sem linha de título: os indicadores abrem a tela (o nome fica para o leitor de tela). */}
      <h1 className="sr-only">Execução da despesa</h1>

      {/* Os INDICADORES em três colunas — Empenhos · Liquidações · Pagamentos — e três leituras complementares: o SALDO
          (sempre à vista: valor − anulado), o ANULADO e o TOTAL (bruto) em "Mais indicadores". Saldo + anulado = total.
          Tocar abre a origem: a lista de cada etapa, e dela o banner padrão do empenho (com as liquidações e os pagamentos). */}
      <div className="grid grid-cols-1 gap-[var(--gap-block)] md:grid-cols-3">
        <KpiStat
          label="Saldo: empenhos"
          value={brl(empenhadoAnim)}
          completo
          cor={COR.empenhado}
          spark={emPct(sp.empenhado)}
          hint={plural(t.empenhos, "empenho", "empenhos")}
          onClick={() => abrirTudo("empenhos", "Saldo: empenhos")}
          acao="ver os empenhos"
        />
        <KpiStat
          label="Saldo: liquidações"
          value={temLiq ? brl(liquidadoAnim) : "—"}
          completo
          cor={COR.liquidado}
          spark={temLiq ? emPct(sp.liquidado) : undefined}
          hint={temLiq ? `${plural(t.liquidacoes, "liquidação", "liquidações")} · ${pctTexto(d.pctLiquidado)} do empenhado` : "Sem acesso às Liquidações"}
          onClick={temLiq ? () => abrirTudo("liquidacoes", "Saldo: liquidações") : undefined}
          acao="ver as liquidações"
        />
        <KpiStat
          label="Saldo: pagamentos"
          value={temPag ? brl(pagoAnim) : "—"}
          completo
          cor={COR.pago}
          spark={temPag ? emPct(sp.pago) : undefined}
          hint={temPag ? `${plural(t.pagamentos, "pagamento", "pagamentos")} · ${pctTexto(d.pctPago)} do empenhado` : "Sem acesso aos Pagamentos"}
          onClick={temPag ? () => abrirTudo("pagamentos", "Saldo: pagamentos") : undefined}
          acao="ver os pagamentos"
        />
      </div>
      {/* "Mais indicadores": abre e fecha pela ALTURA (grid-template-rows 0fr ↔ 1fr) — sempre montado, os de baixo deslizam
          juntos e nada pisca; fechado = inerte (fora do Tab). O corte só durante a transição (as sombras não ficam presas). */}
      <div
        className={`grid ${animarMais ? "transition-[grid-template-rows,opacity,margin] duration-[calc(var(--motion-duration)*1.5)] ease-[var(--motion-ease)] motion-reduce:transition-none" : ""}`}
        style={{ gridTemplateRows: mais ? "1fr" : "0fr", opacity: mais ? 1 : 0, marginTop: mais ? 0 : "calc(-1 * var(--gap-block))" }}
        inert={!mais}
        aria-hidden={!mais}
        onTransitionEnd={(e) => e.target === e.currentTarget && e.propertyName === "grid-template-rows" && setMaisPronto(mais)}
      >
        <div className={`min-h-0 ${mais && maisPronto ? "overflow-visible" : "overflow-hidden"}`}>
          <div className="grid grid-cols-1 gap-[var(--gap-block)] md:grid-cols-3">
            <KpiStat
              label="Anulado: empenhos"
              value={brl(reais(t.empAnulado))}
              completo
              cor={COR.empenhado}
              hint={plural(t.empAnulados, "empenho", "empenhos")}
              onClick={() => abrirOrigem("Anulado: empenhos", recorteTexto, { ...calc.sel, emp: calc.sel.emp.filter((i) => base.emp.anulado[i] > 0) }, "empenhos")}
              acao="ver os empenhos com anulação"
            />
            <KpiStat
              label="Anulado: liquidações"
              value={temLiq ? brl(reais(t.liqAnulado)) : "—"}
              completo
              cor={COR.liquidado}
              hint={temLiq ? plural(t.liqAnuladas, "liquidação", "liquidações") : "Sem acesso às Liquidações"}
              onClick={temLiq ? () => abrirOrigem("Anulado: liquidações", recorteTexto, { ...calc.sel, liq: calc.sel.liq.filter((k) => base.liq.anulado[k] > 0) }, "liquidacoes") : undefined}
              acao="ver as liquidações com anulação"
            />
            <KpiStat
              label="Anulado: pagamentos"
              value={temPag ? brl(reais(t.pagAnulado)) : "—"}
              completo
              cor={COR.pago}
              hint={temPag ? plural(t.pagAnuladas, "pagamento", "pagamentos") : "Sem acesso aos Pagamentos"}
              onClick={temPag ? () => abrirOrigem("Anulado: pagamentos", recorteTexto, { ...calc.sel, pag: calc.sel.pag.filter((k) => base.pag.anuladas[k] > 0) }, "pagamentos") : undefined}
              acao="ver os pagamentos anulados"
            />
            <KpiStat
              label="Total: empenhos"
              value={brl(reais(t.empBruto))}
              completo
              cor={COR.empenhado}
              hint={plural(t.empenhos, "empenho", "empenhos")}
              onClick={() => abrirTudo("empenhos", "Total: empenhos")}
              acao="ver os empenhos"
            />
            <KpiStat
              label="Total: liquidações"
              value={temLiq ? brl(reais(t.liqBruto)) : "—"}
              completo
              cor={COR.liquidado}
              hint={temLiq ? plural(t.liquidacoes, "liquidação", "liquidações") : "Sem acesso às Liquidações"}
              onClick={temLiq ? () => abrirTudo("liquidacoes", "Total: liquidações") : undefined}
              acao="ver as liquidações"
            />
            <KpiStat
              label="Total: pagamentos"
              value={temPag ? brl(reais(t.pago + t.pagAnulado)) : "—"}
              completo
              cor={COR.pago}
              hint={temPag ? plural(t.pagamentos + t.pagAnuladas, "pagamento", "pagamentos") : "Sem acesso aos Pagamentos"}
              onClick={temPag ? () => abrirTudo("pagamentos", "Total: pagamentos") : undefined}
              acao="ver os pagamentos"
            />
          </div>
        </div>
      </div>
      <button
        type="button"
        aria-expanded={mais}
        onClick={() => {
          const novo = !mais;
          try {
            localStorage.setItem(CHAVE_MAIS, novo ? "1" : "0");
          } catch {
            /* sem armazenamento: vale só nesta visita */
          }
          // Sem movimento (sistema ou ADM) não há transição — nem o fim dela: fica pronto na hora.
          const semTransicao = duracaoMotionMs() === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          setAnimarMais(!semTransicao);
          setMaisPronto(semTransicao && novo);
          setMais(novo);
        }}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-card border border-border bg-surface text-[13px] font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text lg:h-[var(--h-control-sm)]"
      >
        {mais ? "Menos indicadores" : "Mais indicadores"}
        <IconChevronDown className={`h-4 w-4 transition-transform ${mais ? "rotate-180" : ""}`} />
      </button>

      {/* TODOS os filtros à vista, logo abaixo dos indicadores, no cartão padrão dos filtros: o Período primeiro e as dimensões em colunas. */}
      <section
        aria-label="Filtros da execução"
        className={`rounded-card border p-[var(--pad-card)] transition-colors ${ativosResumo.length ? "border-accent/30 bg-accent-soft/40" : "border-border bg-surface"}`}
      >
        <FiltrosDashboard
          campos={campos}
          onMudar={mudarFiltro}
          grade
          antes={<PeriodoPicker value={periodo} anos={base.disponiveis} meses={meses} onChange={setPeriodo} className="w-full min-w-0" />}
        />
      </section>
      {erro && <ErroCarga msg={erro} onTentar={onTentar} kind="warn" />}

      {/* O gráfico: o DESENHO ocupa o cartão (com o respiro padrão e o raio do sistema) e os controles ficam SOBRE ele, em vidro:
          o tipo e o agrupamento no alto à esquerda, o funil/avisos/ajuda no alto à direita e a lupa, o restaurar e a tabela
          empilhados no canto inferior direito. Na vista em tabela, os mesmos controles numa linha acima dela. */}
      <ChartCard>
        {(() => {
          const tipoGran = [
              <Segmented<"diario" | "acumulado">
                key="tipo"
                                value={modo}
                onChange={setModo}
                ariaLabel="Tipo do gráfico"
                options={[
                  { value: "acumulado", label: "Acumulado", dica: "O gráfico soma desde o início do período" },
                  { value: "diario", label: "Por período", curto: "Período", dica: "O gráfico mostra o valor de cada dia, semana ou mês" },
                ]}
              />,
              <Segmented<Exclude<Granularidade, "auto">>
                key="gran"
                                value={s.granularidade === "ano" ? "mes" : s.granularidade}
                onChange={setGran}
                ariaLabel="Agrupar o gráfico por"
                options={[
                  { value: "dia", label: "Dia", dica: "Agrupar o gráfico por dia (períodos longos demais sobem para mês)" },
                  { value: "semana", label: "Semana", dica: "Agrupar o gráfico por semana" },
                  { value: "mes", label: "Mês", dica: "Agrupar o gráfico por mês" },
                ]}
              />,
          ];
          // O resumo dos filtros ligados (o MESMO funil das tabelas): entra e sai DESLIZANDO — o grupo cresce ou encolhe suave,
          // sem empurrar de repente os botões ao lado.
          const funil = (
            <span
              className="grid shrink-0 transition-[grid-template-columns,opacity] duration-[var(--motion-duration)] ease-out"
              style={{ gridTemplateColumns: ativosResumo.length > 0 ? "1fr" : "0fr", opacity: ativosResumo.length > 0 ? 1 : 0 }}
              aria-hidden={ativosResumo.length === 0 || undefined}
            >
              {/* O respiro em cima e à direita (com a margem negativa igual) deixa o selo do número inteiro dentro do corte. */}
              <span className="-mt-1.5 -mr-1 flex min-w-0 overflow-hidden pt-1.5 pr-2">
                {ativosResumo.length > 0 && (
                  <FiltrosAtivos
                    titulo="Filtros ligados"
                    colunas={ativosResumo.map((x) => ({
                      key: x.key,
                      header: (
                        <span title={`${x.rotulo}: ${x.valor}`}>
                          <span className="text-muted">{x.rotulo}:</span> {x.valor}
                        </span>
                      ),
                    }))}
                    onLimparColuna={(k) => ativosResumo.find((x) => x.key === k)?.tirar()}
                    onLimpar={limparTudo}
                  />
                )}
              </span>
            </span>
          );
          // À direita: o funil (entra à esquerda), os avisos e a ajuda.
          const direita = (
            <>
              {funil}
              <span className="flex items-center gap-1">
                <Avisos titulo="Avisos dos dados" avisos={avisos} />
                <AjudaExecucao />
              </span>
            </>
          );
          const botaoTabela = (
            <Button
              size="sm"
              variant="icon"
              aria-pressed={verDados}
              aria-label={verDados ? "Ver o gráfico" : "Ver os dados do gráfico em tabela"}
              title={verDados ? "Ver o gráfico" : "Ver os dados do gráfico em tabela"}
              onClick={() => setVerDados((v) => !v)}
            >
              <IconLayers className="h-4 w-4" />
            </Button>
          );
          if (verDados)
            return (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {tipoGran}
                  {botaoTabela}
                  <div className="ml-auto flex items-center">{direita}</div>
                </div>
                <DataTable
                  rows={s.pontos}
                  getKey={(p) => p.chave}
                  density="compact"
                  linhasSalvas="execucao-grafico"
                  exportar={podeExportar ? { nome: `Execução por ${rotuloGran}` } : false}
                  onRowClick={(p) => abrirPonto(p.chave)}
                  columns={colunasSerie(temLiq, temPag)}
                  vazio="Nada no período escolhido."
                />
              </>
            );
          return (
            <div className={CARTAO_GRAFICO}>
              {/* Os controles sobre o desenho, em vidro; em telas menores, numa escala menor (cabem sem cobrir o gráfico). */}
              <div className={`pointer-events-none absolute inset-x-2 top-2 z-10 flex items-start gap-2 max-md:flex-nowrap md:flex-wrap ${ESCALA_CONTROLES}`}>
                {/* O tipo e o agrupamento: dois controles independentes, cada um em vidro sobre o desenho. */}
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <div className={`pointer-events-auto ${VIDRO}`}>{tipoGran[0]}</div>
                  <div className={`pointer-events-auto ${VIDRO}`}>{tipoGran[1]}</div>
                </div>
                {/* No zoom, as setas e as datas da janela no alto, ao lado do tipo e do agrupamento. */}
                  {janela && todo && (
                    <div className={`pointer-events-auto flex items-center gap-1 pr-3 text-[13px] font-medium text-text ${VIDRO}`}>
                      <Button size="sm" variant="icon" aria-label="Voltar no tempo" title="Voltar no tempo" disabled={janela.de <= todo.de} onClick={() => setJanela(deslocarJanela(janela, todo, -1))}>
                        <IconChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="icon" aria-label="Avançar no tempo" title="Avançar no tempo" disabled={janela.ate >= todo.ate} onClick={() => setJanela(deslocarJanela(janela, todo, 1))}>
                        <IconChevronRight className="h-4 w-4" />
                      </Button>
                      <span className="whitespace-nowrap tabular-nums" aria-live="polite" title={`${plural(janelaVista.dias, "dia", "dias")} à vista, por ${rotuloGran}`}>
                        {dataBR(janelaVista.de)} a {dataBR(janelaVista.ate)}
                        <span className="ml-1.5 text-muted">· {plural(janelaVista.dias, "dia", "dias")}</span>
                      </span>
                    </div>
                  )}
                {/* A legenda (uma bolinha por linha, que liga e desliga a linha no gráfico) e o funil/avisos/ajuda; no celular,
                    um embaixo do outro — cabem ao lado do tipo e do agrupamento. */}
                <div className="ml-auto flex shrink-0 items-start gap-2 max-md:flex-col max-md:items-end">
                <fieldset className={`pointer-events-auto flex shrink-0 items-center ${VIDRO}`} aria-label="Linhas do gráfico">
                  {seriesVistas.map((x) => {
                    const vista = seriesDesenho.some((d) => d.chave === x.chave);
                    const ultima = vista && seriesDesenho.length === 1;
                    const rotulo = ultima ? `${x.rotulo}: ao menos uma linha fica no gráfico` : `${vista ? "Ocultar" : "Mostrar"} ${x.rotulo}`;
                    return (
                      <Button
                        key={x.chave}
                        size="sm"
                        variant="icon"
                        aria-pressed={vista}
                        aria-label={rotulo}
                        title={rotulo}
                        disabled={ultima}
                        onClick={() =>
                          setOcultas((o) => {
                            const n = new Set(o);
                            if (n.has(x.chave)) n.delete(x.chave);
                            else n.add(x.chave);
                            return n;
                          })
                        }
                      >
                        <span
                          aria-hidden
                          className="block h-2.5 w-2.5 rounded-full border-2 transition-colors duration-[var(--motion-duration)]"
                          style={{ borderColor: COR[x.chave], background: vista ? COR[x.chave] : "transparent" }}
                        />
                      </Button>
                    );
                  })}
                </fieldset>
                <div className={`pointer-events-auto flex shrink-0 items-center ${VIDRO}`}>{direita}</div>
                </div>
              </div>
              <SerieTemporal
                pontos={pontos}
                preencher
                reservaRotulos={RESERVA_CONTROLES}
                altura={420}
                ajustarY={!!janela && modo === "acumulado"}
                series={seriesDesenho}
                ariaLabel={modo === "acumulado" ? "Evolução acumulada do empenhado, liquidado e pago" : `Empenhado, liquidado e pago por ${rotuloGran}`}
                onEscolher={(p) => abrirPonto(p.chave)}
                extraDica={(p) => {
                  const pt = pontoPorChave.get(p.chave);
                  return pt ? dicaDoPonto(pt, modo, rotuloGran, sTodo.pontos.at(-1), temLiq, temPag) : [];
                }}
                onTrecho={(a, b) => abrirTrecho(a.chave, b.chave)}
                dicaTrecho={(a, b) => {
                  const pa = pontoPorChave.get(a.chave);
                  const pb = pontoPorChave.get(b.chave);
                  return pa && pb ? dicaDoTrecho(s.pontos, pa, pb, rotuloGran, temLiq, temPag) : [];
                }}
              />
              {/* A lupa, o restaurar e a tabela empilhados no canto inferior direito, à mesma distância da borda dos demais. */}
              <div className={`pointer-events-none absolute right-2 bottom-2 z-10 ${ESCALA_PILHA}`}>
                <div className={`pointer-events-auto flex flex-col items-center gap-1 ${VIDRO}`}>
                  <Button size="sm" variant="icon" aria-label="Aproximar" title="Aproximar (menos dias à vista, mais detalhe)" disabled={!todo || diasJanela <= MIN_DIAS_ZOOM} onClick={() => zoom(0.5)}>
                    <IconZoom className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="icon" aria-label="Afastar" title="Afastar (mais dias à vista)" disabled={!janela} onClick={() => zoom(2)}>
                    <IconZoomOut className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="icon" aria-label="Restaurar o zoom" title="Restaurar o zoom (o período inteiro)" disabled={!janela} onClick={() => setJanela(null)}>
                    <IconRestaurar className="h-4 w-4" />
                  </Button>
                  {botaoTabela}
                </div>
              </div>
            </div>
          );
        })()}
      </ChartCard>

      {/* O DEMONSTRATIVO: os mesmos números das KPIs, agrupados pela dimensão escolhida (tocar numa linha = a origem dela). */}
      <DemonstrativoExecucao
        base={base}
        calc={calc}
        podeExportar={podeExportar}
        temLiq={temLiq}
        temPag={temPag}
        onAbrir={(titulo, sel) => abrirOrigem(titulo, recorteTexto, sel, "empenhos")}
      />

      {origem && (
        <OrigemExecucao
          base={base}
          origem={origem}
          temLiq={temLiq}
          temPag={temPag}
          podeExportar={podeExportar}
          gran={rotuloGran}
          onClose={() => setOrigem(null)}
        />
      )}
    </div>
  );
}

type PontoDaSerie = ReturnType<typeof serie>["pontos"][number];

/** A posição de um balde no TEMPO (o dia do meio dele): o gráfico casa os desenhos pela data ao trocar o agrupamento ou o zoom. */
const tDoBalde = (p: PontoDaSerie) => ((diaDoIso(p.de) ?? 0) + (diaDoIso(p.ate) ?? 0)) / 2;

/**
 * A DICA de um ponto do gráfico, além dos valores das séries: no acumulado, o que entrou SÓ neste balde (com as
 * quantidades); por período, o acumulado até aqui; e a execução acumulada — % liquidado e pago sobre o empenhado, o que
 * falta liquidar e pagar e a parte do empenhado do gráfico já alcançada.
 */
function dicaDoPonto(pt: PontoDaSerie, modo: "diario" | "acumulado", gran: string, ultimo: PontoDaSerie | undefined, temLiq: boolean, temPag: boolean): LinhaDica[] {
  const l: LinhaDica[] = [];
  const conta = (n: number, um: string, varios: string) => (n ? ` · ${plural(n, um, varios)}` : "");
  if (modo === "acumulado") {
    const secao = `Neste ${gran}`;
    l.push({ secao, rotulo: "Empenhado", valor: brl(reais(pt.empenhado)) + conta(pt.qEmp, "empenho", "empenhos") });
    if (temLiq) l.push({ secao, rotulo: "Liquidado", valor: brl(reais(pt.liquidado)) + conta(pt.qLiq, "liquidação", "liquidações") });
    if (temPag) l.push({ secao, rotulo: "Pago", valor: brl(reais(pt.pago)) + conta(pt.qPag, "ordem", "ordens") });
  } else {
    const secao = "Acumulado até aqui";
    l.push({ secao, rotulo: "Empenhado", valor: brl(reais(pt.acEmpenhado)) });
    if (temLiq) l.push({ secao, rotulo: "Liquidado", valor: brl(reais(pt.acLiquidado)) });
    if (temPag) l.push({ secao, rotulo: "Pago", valor: brl(reais(pt.acPago)) });
    const qtd = [pt.qEmp && plural(pt.qEmp, "empenho", "empenhos"), temLiq && pt.qLiq && plural(pt.qLiq, "liquidação", "liquidações"), temPag && pt.qPag && plural(pt.qPag, "ordem", "ordens")].filter(Boolean);
    if (qtd.length) l.push({ secao: `Neste ${gran}`, rotulo: "Registros", valor: qtd.join(" · ") });
  }
  const secao = "Execução acumulada";
  const e = pt.acEmpenhado;
  if (temLiq && e > 0) l.push({ secao, rotulo: "Liquidado / empenhado", valor: pctTexto(pt.acLiquidado / e) });
  if (temPag && e > 0) l.push({ secao, rotulo: "Pago / empenhado", valor: pctTexto(pt.acPago / e) });
  if (temLiq) {
    const x = saldoEtapa(e, pt.acLiquidado);
    l.push({ secao, rotulo: SALDO.liquidar[x.excedente ? 1 : 0].rotulo, valor: brl(reais(x.valor)) });
  }
  if (temLiq && temPag) {
    const x = saldoEtapa(pt.acLiquidado, pt.acPago);
    l.push({ secao, rotulo: SALDO.pagar[x.excedente ? 1 : 0].rotulo, valor: brl(reais(x.valor)) });
  }
  if (ultimo && ultimo.acEmpenhado > 0 && ultimo !== pt) l.push({ secao, rotulo: "Do empenhado no gráfico", valor: pctTexto(e / ultimo.acEmpenhado) });
  return l;
}

/**
 * A COMPARAÇÃO de um trecho do gráfico (do início do balde `a` ao fim do `b`): o que entrou no trecho (com as quantidades), a
 * média por balde, o acumulado no início e no fim (e quanto cresceu) e a execução do trecho — % liquidado e pago sobre o
 * empenhado dele. Os acumulados da série dão o trecho sem varrer os registros.
 */
function dicaDoTrecho(pontos: PontoDaSerie[], a: PontoDaSerie, b: PontoDaSerie, gran: string, temLiq: boolean, temPag: boolean): LinhaDica[] {
  const ia = pontos.indexOf(a);
  const ib = pontos.indexOf(b);
  const baldes = pontos.slice(ia, ib + 1);
  const n = baldes.length;
  const no = (ac: number, val: number, acFim: number) => acFim - ac + val;
  const emp = no(a.acEmpenhado, a.empenhado, b.acEmpenhado);
  const liq = no(a.acLiquidado, a.liquidado, b.acLiquidado);
  const pag = no(a.acPago, a.pago, b.acPago);
  const conta = (q: number, um: string, varios: string) => (q ? ` · ${plural(q, um, varios)}` : "");
  const soma = (f: (p: PontoDaSerie) => number) => baldes.reduce((t, p) => t + f(p), 0);
  const dias = (diaDoIso(b.ate) ?? 0) - (diaDoIso(a.de) ?? 0) + 1;
  const baldesTexto = gran === "dia" ? "" : ` · ${n} ${n === 1 ? gran : gran === "mês" ? "meses" : `${gran}s`}`;
  const l: LinhaDica[] = [{ rotulo: "Duração", valor: `${plural(dias, "dia", "dias")}${baldesTexto}` }];
  let secao = "No trecho";
  l.push({ secao, rotulo: "Empenhado", valor: brl(reais(emp)) + conta(soma((p) => p.qEmp), "empenho", "empenhos") });
  if (temLiq) l.push({ secao, rotulo: "Liquidado", valor: brl(reais(liq)) + conta(soma((p) => p.qLiq), "liquidação", "liquidações") });
  if (temPag) l.push({ secao, rotulo: "Pago", valor: brl(reais(pag)) + conta(soma((p) => p.qPag), "ordem", "ordens") });
  if (n > 1) l.push({ secao, rotulo: `Empenhado por ${gran} (média)`, valor: brl(reais(emp / n)) });
  secao = "Acumulado";
  const ini = a.acEmpenhado - a.empenhado;
  l.push({ secao, rotulo: "Empenhado no início", valor: brl(reais(ini)) });
  l.push({ secao, rotulo: "Empenhado no fim", valor: brl(reais(b.acEmpenhado)) });
  if (ini > 0) l.push({ secao, rotulo: "Crescimento no trecho", valor: `+${pctTexto(emp / ini)}` });
  secao = "Execução do trecho";
  if (temLiq && emp > 0) l.push({ secao, rotulo: "Liquidado / empenhado", valor: pctTexto(liq / emp) });
  if (temPag && emp > 0) l.push({ secao, rotulo: "Pago / empenhado", valor: pctTexto(pag / emp) });
  return l;
}

function colunasSerie(temLiq: boolean, temPag: boolean): Column<ReturnType<typeof serie>["pontos"][number]>[] {
  const v = (k: "empenhado" | "liquidado" | "pago" | "acEmpenhado" | "acLiquidado" | "acPago", header: string): Column<ReturnType<typeof serie>["pontos"][number]> => ({
    key: k,
    header,
    align: "right",
    nowrap: true,
    filter: "range",
    numero: (p) => reais(p[k]),
    render: (p) => <span className="tabular-nums">{brl(reais(p[k]))}</span>,
  });
  return [
    { key: "titulo", header: "Período", nowrap: true, value: (p) => p.titulo, render: (p) => p.titulo },
    v("empenhado", "Empenhado"),
    ...(temLiq ? [v("liquidado", "Liquidado")] : []),
    ...(temPag ? [v("pago", "Pago")] : []),
    { ...v("acEmpenhado", "Empenhado acumulado"), total: false },
    ...(temLiq ? [{ ...v("acLiquidado", "Liquidado acumulado"), total: false as const }] : []),
    ...(temPag ? [{ ...v("acPago", "Pago acumulado"), total: false as const }] : []),
  ];
}

/** A ORIGEM de um número: as abas Empenhos · Liquidações · Pagamentos com as linhas que o formam. */
/**
 * Os SALDOS entre etapas, sem número negativo (`saldoEtapa`): [o normal, o excedente]. A etapa seguinte passa da anterior
 * quando o recorte executa empenhos de outros períodos (restos a pagar).
 */
const SALDO = {
  liquidar: [
    { rotulo: "A liquidar", hint: "Empenhado − liquidado" },
    { rotulo: "Liquidado além do empenhado", hint: "Liquidações de empenhos de outros períodos (restos a pagar)" },
  ],
  pagar: [
    { rotulo: "A pagar", hint: "Liquidado − pago" },
    { rotulo: "Pago além do liquidado", hint: "Pagamentos de liquidações anteriores ao período (restos a pagar)" },
  ],
} as const;

/** Os "Maiores" do painel da origem: os 5 maiores pelo empenhado e o resto somado. */
const DIMS_MAIORES: { value: DimDemonstrativo; label: string }[] = [
  { value: "unidade", label: "Unidade" },
  { value: "elemento", label: "Elemento" },
  { value: "fornecedor", label: "Fornecedor" },
];
const TOP_MAIORES = 5;

function OrigemExecucao({
  base,
  origem,
  temLiq,
  temPag,
  podeExportar,
  gran,
  onClose,
}: {
  base: BaseExec;
  origem: Origem;
  temLiq: boolean;
  temPag: boolean;
  podeExportar: boolean;
  /** O agrupamento do gráfico (o texto da dica da evolução). */
  gran: string;
  onClose: () => void;
}) {
  const [aba, setAba] = useState<Aba>(origem.aba);
  const [acum, setAcum] = useState(!!(origem.acumulado && origem.noAcumulado));
  const [dimMaior, setDimMaior] = useState<DimDemonstrativo>("unidade");
  /** A barra tocada nos "Maiores" — recorta as listas (a origem daquela linha). */
  const [foco, setFoco] = useState<{ dim: DimDemonstrativo; chave: string; rotulo: string } | null>(null);
  const ativo = acum && origem.acumulado ? origem.acumulado : origem;
  // O EMPENHO de uma linha abre AO LADO (a pilha padrão: origem | empenho | liquidação ou pagamento).
  const [empI, setEmpI] = useState<number | null>(null);
  const empTela = useMemo(() => (empI == null ? null : paraTela(empenhoExec(base, empI))), [base, empI]);
  const pe = usePaineisEmpenho(empTela, () => setEmpI(null));
  // A evolução até o ponto: o MESMO desenho e a mesma dica do gráfico da tela.
  const evolucao = useMemo(
    () =>
      (origem.acumulado?.pontos ?? []).map((p) => ({
        chave: p.chave,
        rotulo: p.rotulo,
        titulo: p.titulo,
        t: tDoBalde(p),
        valores: { empenhado: reais(p.acEmpenhado), liquidado: reais(p.acLiquidado), pago: reais(p.acPago) },
      })),
    [origem.acumulado],
  );
  const serieEvolucao = useMemo(() => new Map((origem.acumulado?.pontos ?? []).map((p) => [p.chave, p])), [origem.acumulado]);
  const r = useMemo(() => resumoSelecao(base, ativo.sel), [base, ativo.sel]);
  const maiores = useMemo(() => demonstrativo(base, ativo, dimMaior), [base, ativo, dimMaior]);
  const sel = useMemo(() => (foco ? selecaoDaLinha(base, ativo.sel, foco.dim, foco.chave) : ativo.sel), [base, ativo.sel, foco]);
  const rs = foco ? resumoSelecao(base, sel) : r;
  // Só as linhas da aba ABERTA são montadas (o resto fica nos índices); a tabela pagina pelo limite do sistema.
  const linhasEmp = useMemo(() => (aba === "empenhos" ? Array.from(sel.emp, (i) => ({ i, ...empenhoExec(base, i) })) : []), [aba, base, sel.emp]);
  const linhasEv = useMemo(
    () => (aba === "liquidacoes" && temLiq ? Array.from(sel.liq, (k) => liquidacaoExec(base, k)) : aba === "pagamentos" && temPag ? Array.from(sel.pag, (k) => pagamentoExec(base, k)) : []),
    [aba, base, sel.liq, sel.pag, temLiq, temPag],
  );
  const sLiq = saldoEtapa(r.empenhado, r.liquidado);
  const sPag = saldoEtapa(r.liquidado, r.pago);
  const pct = (v: number) => (r.empenhado > 0 ? ` · ${pctTexto(v / r.empenhado)} do empenhado` : "");

  const linhasMaiores: LinhaBarra[] = useMemo(() => {
    const top = maiores.slice(0, TOP_MAIORES);
    const resto = maiores.slice(TOP_MAIORES);
    const linha = (chave: string, rotulo: string, empenhado: number, clicavel: boolean): LinhaBarra => ({
      chave,
      rotulo,
      titulo: `${rotulo}: ${brl(reais(empenhado))} empenhado`,
      segmentos: [{ chave: "empenhado", valor: reais(empenhado), cor: COR.empenhado, rotulo: "Empenhado" }],
      valor: brl(reais(empenhado)),
      detalhe: r.empenhado > 0 ? pctTexto(empenhado / r.empenhado) : undefined,
      apagada: !clicavel,
      clicavel,
    });
    return [
      ...top.map((l) => linha(l.chave, l.rotulo, l.empenhado, true)),
      ...(resto.length
        ? [
            linha("__outras", `Outras ${num(resto.length)}`, resto.reduce((t, l) => t + l.empenhado, 0), false),
          ]
        : []),
    ];
  }, [maiores, r.empenhado]);

  const composicao: Segmento[] = [
    ...(temPag ? [{ chave: "pago", valor: reais(Math.min(r.pago, r.liquidado, r.empenhado)), cor: COR.pago, rotulo: "Pago" }] : []),
    ...(temLiq
      ? [{ chave: "liquidado", valor: reais(Math.max(0, Math.min(r.liquidado, r.empenhado) - (temPag ? Math.min(r.pago, r.liquidado, r.empenhado) : 0))), cor: COR.liquidado, rotulo: "Liquidado a pagar" }]
      : []),
    ...(temLiq ? [{ chave: "aliquidar", valor: reais(Math.max(0, r.empenhado - r.liquidado)), cor: "var(--track)", rotulo: "A liquidar" }] : []),
  ];

  return (
    <OrigemDados
      aberto
      onClose={onClose}
      titulo={origem.titulo}
      recorte={ativo.recorte}
      paineis={[pe.empenho, pe.execucao]}
      resumo={[
        { label: "Empenhado", value: brl(reais(r.empenhado)), hint: plural(r.empenhos, "empenho", "empenhos") },
        ...(temLiq ? [{ label: "Liquidado", value: brl(reais(r.liquidado)), hint: `${plural(r.qLiq, "liquidação", "liquidações")}${pct(r.liquidado)}` }] : []),
        ...(temPag ? [{ label: "Pago", value: brl(reais(r.pago)), hint: `${plural(r.qPag, "ordem", "ordens")}${pct(r.pago)}` }] : []),
        ...(temLiq ? [{ label: SALDO.liquidar[sLiq.excedente ? 1 : 0].rotulo, value: brl(reais(sLiq.valor)), hint: SALDO.liquidar[sLiq.excedente ? 1 : 0].hint, tone: sLiq.excedente ? ("warn" as const) : undefined }] : []),
        ...(temLiq && temPag ? [{ label: SALDO.pagar[sPag.excedente ? 1 : 0].rotulo, value: brl(reais(sPag.valor)), hint: SALDO.pagar[sPag.excedente ? 1 : 0].hint, tone: sPag.excedente ? ("warn" as const) : undefined }] : []),
      ]}
      fonte={
        <>
          Empenhos, liquidações e pagamentos importados da Centi, ligados pelo número do empenho.{" "}
          Cada etapa pela própria data (os restos a pagar inclusive). As liquidações e os
          pagamentos aparecem somados por empenho e dia.
        </>
      }
    >
      {origem.acumulado && (
        <Segmented<"periodo" | "acumulado">
          value={acum ? "acumulado" : "periodo"}
          onChange={(v) => {
            setAcum(v === "acumulado");
            setFoco(null); // a barra tocada era do outro recorte
          }}
          ariaLabel="Recorte da origem"
          options={[
            { value: "periodo", label: `Só ${origem.recorte}`, curto: "Só o ponto", dica: "Os registros deste dia, semana ou mês" },
            { value: "acumulado", label: "Acumulado até aqui", curto: "Acumulado", dica: "Os registros desde o início do gráfico até este ponto" },
          ]}
        />
      )}

      {/* O PAINEL VISUAL do recorte: a evolução (no acumulado), a composição e os maiores. */}
      <div className="grid gap-[var(--gap-block)] lg:grid-cols-2">
        {acum && origem.acumulado && origem.acumulado.pontos.length > 1 && (
          <section className="rounded-card border border-border p-[var(--pad-card)] lg:col-span-2" aria-label="Evolução acumulada até o ponto">
            {/* O MESMO desenho do gráfico da tela (o cartão inteiro, as datas por dentro, o título em vidro e a mesma dica). */}
            <div className={CARTAO_GRAFICO}>
              <SerieTemporal
                pontos={evolucao}
                preencher
                series={SERIES.filter((x) => (x.chave === "liquidado" ? temLiq : x.chave === "pago" ? temPag : true))}
                altura={280}
                ajustarY={origem.acumulado.ajustarY}
                ariaLabel="Evolução acumulada do empenhado, liquidado e pago até o ponto"
                extraDica={(p) => {
                  const pt = serieEvolucao.get(p.chave);
                  return pt ? dicaDoPonto(pt, "acumulado", gran, origem.acumulado?.pontos.at(-1), temLiq, temPag) : [];
                }}
              />
              <div className={`pointer-events-none absolute top-2 left-2 z-10 px-3 py-1.5 text-[13px] font-semibold text-text ${VIDRO} ${ESCALA_CONTROLES}`}>
                Evolução até {origem.recorte}
              </div>
            </div>
          </section>
        )}
        {temLiq && r.empenhado > 0 && (
          <section className="rounded-card border border-border p-[var(--pad-card)]" aria-label="Composição do empenhado">
            <h3 className="mb-3 text-[13px] font-semibold text-text">Composição do empenhado</h3>
            <BarraSegmentada segmentos={composicao} max={reais(r.empenhado)} altura={14} trilho />
            <ul className="mt-3 space-y-1.5 text-[12.5px]">
              {composicao.map((c) => (
                <li key={c.chave} className="flex items-center gap-2">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: c.cor }} />
                  <span className="min-w-0 flex-1 truncate text-text-2">{c.rotulo}</span>
                  <span className="tabular-nums font-semibold text-text">{brl(c.valor)}</span>
                  <span className="w-14 text-right tabular-nums text-muted">{pctTexto(c.valor / reais(r.empenhado))}</span>
                </li>
              ))}
            </ul>
            {(sLiq.excedente || sPag.excedente) && <p className="mt-2 text-[12px] text-warn">Inclui a execução de empenhos de outros períodos (restos a pagar) — fora desta barra.</p>}
          </section>
        )}
        {maiores.length > 0 && (
          <section className={`rounded-card border border-border p-[var(--pad-card)] ${temLiq && r.empenhado > 0 ? "" : "lg:col-span-2"}`} aria-label="Maiores pelo empenhado">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold text-text">Maiores pelo empenhado</h3>
              <Segmented<DimDemonstrativo> value={dimMaior} onChange={setDimMaior} ariaLabel="Maiores por" options={DIMS_MAIORES} />
            </div>
            <BarrasH
              linhas={linhasMaiores}
              ariaLabel={`Maiores por ${ROTULO_DIM[dimMaior as DimExec] ?? dimMaior}`}
              ativa={foco?.dim === dimMaior ? foco.chave : null}
              acao="filtrar os registros abaixo"
              onEscolher={(k) => {
                const l = maiores.find((x) => x.chave === k);
                if (!l) return;
                setFoco((f) => (f && f.dim === dimMaior && f.chave === l.chave ? null : { dim: dimMaior, chave: l.chave, rotulo: l.rotulo }));
              }}
            />
          </section>
        )}
      </div>

      {/* Os REGISTROS (paginados pelo limite do sistema — Configurações → Tabelas). */}
      <section aria-label="Registros" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Aba>
            value={aba}
            onChange={setAba}
            ariaLabel="Etapa da origem"
            options={[
              { value: "empenhos", label: `Empenhos (${num(rs.empenhos)})`, curto: "Empenhos" },
              ...(temLiq ? [{ value: "liquidacoes" as const, label: `Liquidações (${num(rs.qLiq)})`, curto: "Liquidações" }] : []),
              ...(temPag ? [{ value: "pagamentos" as const, label: `Pagamentos (${num(rs.qPag)})`, curto: "Pagamentos" }] : []),
            ]}
          />
          {foco && (
            <Button size="sm" variant="secondary" onClick={() => setFoco(null)} aria-label={`Tirar o filtro ${foco.rotulo}`} title="Tirar o filtro">
              <span className="max-w-[16rem] truncate">
                {ROTULO_DIM[foco.dim as DimExec] ?? foco.dim}: {foco.rotulo}
              </span>
              <IconClose size={14} />
            </Button>
          )}
        </div>
        {aba === "empenhos" ? (
          <DataTable
            rows={linhasEmp}
            getKey={(e) => e.i}
            density="compact"
            linhasSalvas="origem-execucao"
            exportar={podeExportar ? { nome: `Origem - empenhos - ${ativo.recorte}` } : false}
            onRowClick={(e) => setEmpI(e.i)}
            activeKey={empI}
            columns={COLUNAS_EMP}
            vazio="Nenhum empenho neste recorte."
            resumo={(l) => `${plural(l.length, "empenho", "empenhos")} · ${brl(l.reduce((x, e) => x + e.valorEmpenhado - e.valorAnulado, 0))}`}
          />
        ) : (
          <DataTable
            rows={linhasEv}
            getKey={(e) => e.chave}
            density="compact"
            linhasSalvas="origem-execucao"
            exportar={podeExportar ? { nome: `Origem - ${aba} - ${ativo.recorte}` } : false}
            onRowClick={(e) => e.ei >= 0 && setEmpI(e.ei)}
            columns={aba === "liquidacoes" ? COLUNAS_LIQ : COLUNAS_PAG}
            vazio={aba === "liquidacoes" ? "Nenhuma liquidação neste recorte." : "Nenhum pagamento neste recorte."}
            resumo={(l) => `${num(l.reduce((x, e) => x + e.quantidade, 0))} registros · ${brl(l.reduce((x, e) => x + e.valor, 0))}`}
          />
        )}
      </section>
    </OrigemDados>
  );
}

const reaisCol = <T,>(key: string, header: string, f: (x: T) => number, forte = false): Column<T> => ({
  key,
  header,
  align: "right",
  nowrap: true,
  filter: "range",
  numero: f,
  render: (x) => <span className={`tabular-nums ${forte ? "font-semibold text-text" : "text-text-2"}`}>{brl(f(x))}</span>,
});

type LinhaEmp = EmpenhoExec & { i: number };
const COLUNAS_EMP: Column<LinhaEmp>[] = [
  { key: "numero", header: "Nº", nowrap: true, total: false, value: (e) => e.numero, render: (e) => <CelulaCopiavel copiar={e.numero} rotulo="o número do empenho">{e.numero}</CelulaCopiavel> },
  { key: "data", header: "Data", nowrap: true, filter: "date", value: (e) => e.data ?? "", render: (e) => dataBR(e.data) || "—" },
  { key: "unidade", header: "Unidade", nowrap: true, value: (e) => e.unidade ?? "—", render: (e) => e.unidade ?? "—" },
  { key: "fornecedor", header: "Fornecedor", minWidth: 200, value: (e) => e.fornecedor ?? "", render: (e) => <CelulaTexto texto={e.fornecedor} /> },
  { key: "elemento", header: "Elemento", minWidth: 160, value: (e) => e.elemento ?? "", render: (e) => <CelulaTexto texto={e.elemento} /> },
  reaisCol<LinhaEmp>("empenhado", "Empenhado", (e) => e.valorEmpenhado - e.valorAnulado, true),
  reaisCol<LinhaEmp>("anulado", "Anulado", (e) => e.valorAnulado),
  reaisCol<LinhaEmp>("liquidado", "Liquidado (Centi)", (e) => e.valorLiquidado),
  reaisCol<LinhaEmp>("pago", "Pago (Centi)", (e) => e.valorPago),
];

const colunasEvento = (pag: boolean): Column<EventoExec>[] => [
  { key: "data", header: "Data", nowrap: true, filter: "date", value: (e) => e.data ?? "", render: (e) => dataBR(e.data) || "—" },
  {
    key: "numero",
    header: "Empenho",
    nowrap: true,
    total: false,
    value: (e) => e.numero ?? "Sem empenho no sistema",
    render: (e) => (e.numero ? <CelulaCopiavel copiar={e.numero} rotulo="o número do empenho">{e.numero}</CelulaCopiavel> : <span className="text-warn">Sem empenho no sistema</span>),
  },
  { key: "orgao", header: "Órgão", nowrap: true, value: (e) => e.orgao, render: (e) => e.orgao },
  { key: "unidade", header: "Unidade", nowrap: true, value: (e) => e.unidade ?? "—", render: (e) => e.unidade ?? "—" },
  { key: "fornecedor", header: "Fornecedor", minWidth: 200, value: (e) => e.fornecedor ?? "", render: (e) => <CelulaTexto texto={e.fornecedor} /> },
  { key: "quantidade", header: pag ? "Ordens" : "Liquidações", align: "right", nowrap: true, filter: "range", numero: (e) => e.quantidade, formatarFaixa: num, render: (e) => num(e.quantidade) },
  reaisCol<EventoExec>("valor", pag ? "Pago" : "Liquidado", (e) => e.valor, true),
  ...(pag ? [reaisCol<EventoExec>("retido", "Retido", (e) => e.retido), reaisCol<EventoExec>("liquido", "Pago líquido", (e) => e.liquido)] : []),
  reaisCol<EventoExec>("anulado", "Anulado", (e) => e.anulado),
];
const COLUNAS_LIQ = colunasEvento(false);
const COLUNAS_PAG = colunasEvento(true);

/** O (?) da tela: o período e o tipo, as contas de cada número e o que fica de fora. */
function AjudaExecucao() {
  return (
    <Ajuda titulo="Execução da despesa" botao="sm">
      <TopicoAjuda icone={<IconLayers className="h-4 w-4" />} titulo="Período e tipo">
        Cada etapa conta pela própria data: o que foi empenhado, liquidado e pago no Período (os anos carregados seguem o Período). O Tipo
        separa as liquidações e os pagamentos em Nota de Empenho (empenho do mesmo ano) e Restos a Pagar (empenho de ano anterior ou não
        importado) — a mesma regra das tabelas; com Restos a Pagar, o empenhado do período não entra.
      </TopicoAjuda>
      <TopicoAjuda icone={<IconInfo className="h-4 w-4" />} titulo="As contas">
        Empenhado = valor empenhado − anulado (a anulação não tem data na Centi: fica na data do empenho). Liquidado = valor das liquidações −
        anulado. Pago = valor das ordens de pagamento não anuladas; o retido e o pago líquido também só das não anuladas. Cada registro da Centi
        conta uma vez, mesmo que esteja em dois cards.
      </TopicoAjuda>
      <TopicoAjuda icone={<IconZoom className="h-4 w-4" />} titulo="O gráfico">
        Passe o mouse para ver os valores de cada ponto. Um clique MARCA o ponto (a dica fica parada e dá para passar o mouse sobre ela); um
        segundo clique no mesmo ponto — ou “Ver os dados completos” — abre a origem. Esc ou um clique fora desmarca. A lupa muda o período à
        vista e o botão de camadas mostra os mesmos números em tabela.
      </TopicoAjuda>
      <TopicoAjuda icone={<IconDatabase className="h-4 w-4" />} titulo="De onde vêm e o que fica fora">
        Os cards de Empenhos, Liquidações e Pagamentos, ligados pelo número do empenho; só os registros da sua unidade e só as etapas cujas telas
        você abre. Liquidação ou pagamento sem o empenho no sistema aparece como “Sem empenho no sistema” (em geral, restos a pagar de anos não
        importados). Registros removidos na Centi ficam fora; os sem data só entram em “Todo o período”. Toque em qualquer número para ver as
        linhas que o formam.
      </TopicoAjuda>
    </Ajuda>
  );
}

/** As dimensões do demonstrativo (as dos filtros e o Mensal). */
const DIMS_DEMONSTRATIVO: readonly { valor: DimDemonstrativo; rotulo: string }[] = [
  ...DIMS_EXEC.map((d) => ({ valor: d as DimDemonstrativo, rotulo: ROTULO_DIM[d] })),
  { valor: "mes", rotulo: "Mensal" },
];

/** A TABELA DEMONSTRATIVA do dashboard: "Demonstrativo por" (a dimensão), uma linha por valor com a barra da participação no empenhado. */
function DemonstrativoExecucao({
  base,
  calc,
  podeExportar,
  temLiq,
  temPag,
  onAbrir,
}: {
  base: BaseExec;
  calc: Calculo;
  podeExportar: boolean;
  temLiq: boolean;
  temPag: boolean;
  onAbrir: (titulo: string, sel: Selecao) => void;
}) {
  const [dim, setDim] = useState<DimDemonstrativo>("unidade");
  const linhas = useMemo(() => demonstrativo(base, calc, dim), [base, calc, dim]);
  const maior = useMemo(() => Math.max(0, ...linhas.map((l) => l.empenhado)), [linhas]);
  const rotuloDim = DIMS_DEMONSTRATIVO.find((x) => x.valor === dim)?.rotulo ?? "";
  const valor = (k: "empenhado" | "anulado" | "liquidado" | "retido" | "pago", header: string, cor?: (l: LinhaDemonstrativo) => string | undefined): Column<LinhaDemonstrativo> => ({
    key: k,
    header,
    align: "right",
    nowrap: true,
    filter: "range",
    numero: (l) => reais(l[k]),
    render: (l) => (
      <span className="tabular-nums" style={{ color: cor?.(l) }}>
        {brl(reais(l[k]))}
      </span>
    ),
  });
  const colunas: Column<LinhaDemonstrativo>[] = [
    {
      key: "rotulo",
      header: rotuloDim,
      minWidth: 260,
      align: "left",
      value: (l) => l.rotulo,
      render: (l) => (
        <div className="min-w-0 py-0.5" title={l.detalhe ? `${l.rotulo} — ${l.detalhe}` : l.rotulo}>
          <span className="block truncate text-text">{l.rotulo}</span>
          <span aria-hidden className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-surface-2">
            <span className="block h-full rounded-full" style={{ width: `${maior > 0 ? Math.max(0, (l.empenhado / maior) * 100) : 0}%`, background: COR.empenhado }} />
          </span>
        </div>
      ),
    },
    valor("empenhado", "Empenhado"),
    ...(temLiq ? [valor("liquidado", "Liquidado")] : []),
    valor("anulado", "Anulado", (l) => (l.anulado > 0 ? "var(--warn)" : "var(--faint)")),
    ...(temPag ? [valor("retido", "Retido"), valor("pago", "Pago")] : []),
    ...(temPag
      ? [
          {
            key: "pctPago",
            header: "% pago",
            align: "right" as const,
            nowrap: true,
            total: false as const,
            filter: "range" as const,
            numero: (l: LinhaDemonstrativo) => (l.empenhado > 0 ? (l.pago / l.empenhado) * 100 : 0),
            formatarFaixa: (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
            render: (l: LinhaDemonstrativo) => <span className="tabular-nums text-text-2">{l.empenhado > 0 ? pctTexto(l.pago / l.empenhado) : "—"}</span>,
          },
        ]
      : []),
  ];
  return (
    <ChartCard>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-text">Demonstrativo por</h2>
        <div className="w-full min-w-0 sm:w-56">
          <SelectField compacto label="" aria-label="Demonstrativo por" value={dim} onChange={(e) => setDim(e.target.value as DimDemonstrativo)}>
            {DIMS_DEMONSTRATIVO.map((x) => (
              <option key={x.valor} value={x.valor}>
                {x.rotulo}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
      <DataTable
        visao={dim}
        rows={linhas}
        getKey={(l) => l.chave}
        columns={colunas}
        density="compact"
        exportar={podeExportar ? { nome: `Demonstrativo por ${rotuloDim}` } : false}
        onRowClick={(l) => onAbrir(`${rotuloDim}: ${l.rotulo}`, selecaoDaLinha(base, calc.sel, dim, l.chave))}
        vazio="Nada no recorte dos filtros."
        resumo={(l) =>
          `${num(l.length)} ${l.length === 1 ? "linha" : "linhas"} · Empenhado ${brl(reais(l.reduce((t, x) => t + x.empenhado, 0)))}${temPag ? ` · Pago ${brl(reais(l.reduce((t, x) => t + x.pago, 0)))}` : ""}`
        }
      />
    </ChartCard>
  );
}
