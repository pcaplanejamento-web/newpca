"use client";

import dynamic from "next/dynamic";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { EmpenhoNaTela } from "@/lib/empenhos-tela-core";
import {
  type BaseExec,
  type Calculo,
  calcular,
  confianca,
  DIMS_EXEC,
  DIMS_PRINCIPAIS,
  derivados,
  type DimExec,
  type EmpenhoExec,
  type EventoExec,
  empenhoExec,
  type FiltrosExec,
  type Granularidade,
  liquidacaoExec,
  opcoesDim,
  pagamentoExec,
  reais,
  ROTULO_DIM,
  rotuloOpcao,
  type Selecao,
  selecaoNoIntervalo,
  serie,
  sparks,
  type Visao,
} from "@/lib/execucao-dash-core";
import { brl, brlCompact, dataBR, dataHoraBR, num } from "@/lib/format";
import { intervaloDoPeriodo, type Periodo, PERIODO_TODO, rotuloPeriodo, textoIntervalo } from "@/lib/periodo";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CelulaCopiavel } from "./BotaoCopiar";
import { CelulaTexto } from "./CelulaLista";
import { ChartCard } from "./ChartCard";
import { BarrasH } from "./charts/Barras";
import type { PontoTemporal } from "./charts/SerieTemporal";
import { corSerie } from "./charts/shared";
import { type Column, DataTable } from "./DataTable";
import { EmpenhoBanner } from "./EmpenhoDetalhe";
import { ErroCarga } from "./ErroCarga";
import { FiltrosDashboard } from "./FiltrosDashboard";
import { IconChevronDown, IconClose, IconDatabase, IconFilter, IconInfo, IconLayers, IconExecucao } from "./icons";
import { KpiStat } from "./KpiStat";
import { OrigemDados } from "./OrigemDados";
import { PeriodoPicker } from "./PeriodoPicker";
import { Segmented } from "./Segmented";
import { SeletorMultiplo } from "./SeletorMultiplo";
import { Skeleton } from "./Skeleton";
import { StatMini } from "./StatMini";
import { useContagem } from "./useContagem";

// O gráfico (Recharts) só chega com a tela: a mesma altura enquanto o código é baixado.
const SerieTemporal = dynamic(() => import("./charts/SerieTemporal").then((m) => m.SerieTemporal), {
  ssr: false,
  loading: () => <Skeleton className="h-[360px] w-full rounded-card" />,
});

/** As séries (a ordem das cores `--serie-*`: azul, verde, âmbar). */
const SERIES = [
  { chave: "empenhado", rotulo: "Empenhado", cor: 0 },
  { chave: "liquidado", rotulo: "Liquidado", cor: 1 },
  { chave: "pago", rotulo: "Pago", cor: 2 },
] as const;

type Aba = "empenhos" | "liquidacoes" | "pagamentos";
type Origem = { titulo: string; recorte: string; sel: Selecao; aba: Aba };

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
 * O DASHBOARD DA EXECUÇÃO (corpo da tela): o título com as VISÕES, o período e os anos; a faixa de confiança; os
 * indicadores; os filtros; o funil e a série (diária/acumulada, com zoom). TODO número sai do núcleo
 * (`execucao-dash-core.ts` — `calcular`), com a ORIGEM de cada um (a soma da lista = o número).
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
  const [visao, setVisao] = useState<Visao>("movimento");
  const [periodo, setPeriodo] = useState<Periodo>(PERIODO_TODO);
  const [filtros, setFiltros] = useState<FiltrosExec>({});
  const [modo, setModo] = useState<"diario" | "acumulado">("acumulado");
  const [gran, setGran] = useState<Granularidade>("auto");
  const [mais, setMais] = useState(false);
  const [verDados, setVerDados] = useState(false);
  const [origem, setOrigem] = useState<Origem | null>(null);
  const [empenho, setEmpenho] = useState<EmpenhoNaTela | null>(null);
  useEffect(() => setMais(lerMais()), []);

  // Os filtros mudam na hora; o cálculo segue um quadro depois (a tela não trava com centenas de milhares de registros).
  const pedido = useMemo(() => ({ visao, periodo, filtros }), [visao, periodo, filtros]);
  const adiado = useDeferredValue(pedido);
  const atrasado = adiado !== pedido || carregando;
  const intervalo = useMemo(() => intervaloDoPeriodo(adiado.periodo, hoje), [adiado.periodo, hoje]);
  const calc: Calculo = useMemo(() => calcular(base, adiado.visao, intervalo, adiado.filtros), [base, adiado.visao, intervalo, adiado.filtros]);
  const t = calc.totais;
  const d = derivados(t);
  const sp = useMemo(() => sparks(base, calc.sel, hoje), [base, calc.sel, hoje]);
  const s = useMemo(() => serie(base, calc, intervalo, gran, hoje), [base, calc, intervalo, gran, hoje]);
  const conf = useMemo(() => confianca(base.meta, base.fontes, Date.now()), [base.meta, base.fontes]);
  const safra = adiado.visao === "safra";
  const temLiq = base.fontes.liquidacoes;
  const temPag = base.fontes.pagamentos;

  const empenhadoAnim = useContagem(reais(t.empenhado));
  const liquidadoAnim = useContagem(reais(t.liquidado));
  const pagoAnim = useContagem(reais(t.pago));
  const quartoAnim = useContagem(reais(safra ? d.aPagar : t.retido));

  const campos = useMemo(
    () =>
      DIMS_EXEC.map((dim) => ({
        dim,
        rotulo: ROTULO_DIM[dim],
        opcoes: opcoesDim(base, calc, adiado.filtros, dim),
        selecionados: [...(filtros[dim] ?? [])],
      })),
    [base, calc, adiado.filtros, filtros],
  );
  const chips = DIMS_EXEC.flatMap((dim) => (filtros[dim] ?? []).map((k) => ({ dim, chave: k, rotulo: rotuloOpcao(base, dim, k) })));
  const mudarFiltro = (dim: string, chaves: string[]) =>
    setFiltros((f) => {
      const n = { ...f };
      if (chaves.length) n[dim as DimExec] = chaves;
      else delete n[dim as DimExec];
      return n;
    });
  const tirarChip = (dim: DimExec, k: string) => mudarFiltro(dim, (filtros[dim] ?? []).filter((x) => x !== k));

  const pontos: PontoTemporal[] = useMemo(
    () =>
      s.pontos.map((p) => ({
        chave: p.chave,
        rotulo: p.rotulo,
        titulo: p.titulo,
        atual: p.atual,
        valores:
          modo === "acumulado"
            ? { empenhado: reais(p.acEmpenhado), liquidado: reais(p.acLiquidado), pago: reais(p.acPago) }
            : { empenhado: reais(p.empenhado), liquidado: reais(p.liquidado), pago: reais(p.pago) },
      })),
    [s.pontos, modo],
  );
  const seriesVistas = SERIES.filter((x) => (x.chave === "liquidado" ? temLiq : x.chave === "pago" ? temPag : true));
  const rotuloGran = { dia: "dia", semana: "semana", mes: "mês", ano: "ano" }[s.granularidade];

  const recorteTexto = [
    rotuloPeriodo(adiado.periodo) + (intervalo.de || intervalo.ate ? ` (${textoIntervalo(intervalo)})` : ""),
    anos.length > 1 ? `anos ${anos.join(", ")}` : `ano ${anos[0] ?? "—"}`,
    safra ? "por empenho" : "por movimento",
  ].join(" · ");

  const abrirOrigem = (titulo: string, recorte: string, sel: Selecao, aba: Aba) => setOrigem({ titulo, recorte, sel, aba });
  const abrirTudo = (aba: Aba, titulo: string) => abrirOrigem(titulo, recorteTexto, calc.sel, aba);

  return (
    <div className={`space-y-[var(--gap-block)] transition-opacity ${atrasado ? "opacity-70" : ""}`} aria-busy={atrasado}>
      {/* O título com as visões, o período e os anos (no celular, os controles descem em linhas próprias). */}
      <div className="linha-topico flex flex-wrap items-center gap-2">
        <h1 className="mr-auto flex min-w-0 items-center gap-2 text-[15px] font-bold text-text">
          <IconExecucao className="h-5 w-5 shrink-0 text-accent" aria-hidden />
          <span className="truncate">Execução da despesa</span>
          <AjudaExecucao />
        </h1>
        <div className="grid w-full grid-cols-1 gap-2 min-[480px]:grid-cols-2 lg:flex lg:w-auto lg:items-center">
          <Segmented<Visao>
            value={visao}
            onChange={setVisao}
            ariaLabel="Visão da execução"
            className="min-[480px]:col-span-2 lg:col-span-1"
            options={[
              { value: "movimento", label: "Movimento", dica: "Cada etapa pela própria data: o que foi empenhado, liquidado e pago no período" },
              { value: "safra", label: "Por empenho", curto: "Por empenho", dica: "Os empenhos do período e toda a execução deles, de qualquer data (mostra o que falta pagar)" },
            ]}
          />
          <PeriodoPicker value={periodo} anos={anos} onChange={setPeriodo} className="w-full min-w-0 lg:w-auto" />
          <div className="min-w-0 lg:w-56">
            <SeletorMultiplo
              suspenso
              rotulo="Anos"
              textoVazio="O mais recente"
              opcoes={base.disponiveis.map((a) => ({ valor: String(a), rotulo: String(a) }))}
              selecionados={anos.map(String)}
              onChange={(vs) => onAnos(vs.map(Number).filter(Number.isInteger).slice(0, 5))}
            />
          </div>
        </div>
      </div>

      {erro && <ErroCarga msg={erro} onTentar={onTentar} kind="warn" />}
      <FaixaConfianca atualizado={conf.atualizado} avisos={conf.avisos} recorte={recorteTexto} carregando={carregando} />

      {/* Os indicadores: 4 à vista, o valor inteiro (a fonte acompanha o cartão). */}
      <div className="grid grid-cols-1 gap-[var(--gap-block)] min-[420px]:grid-cols-2 lg:grid-cols-4">
        <KpiStat
          label="Empenhado"
          value={brl(empenhadoAnim)}
          completo
          cor={corSerie(0)}
          spark={emPct(sp.empenhado)}
          hint="Líquido das anulações"
          detalhes={[
            { rotulo: "Empenhos", valor: num(t.empenhos) },
            { rotulo: "Anulado", valor: brl(reais(t.empAnulado)), cor: t.empAnulado ? "var(--danger)" : undefined },
          ]}
          onClick={() => abrirTudo("empenhos", "Empenhado")}
          acao="ver os empenhos"
        />
        <KpiStat
          label="Liquidado"
          value={temLiq ? brl(liquidadoAnim) : "—"}
          completo
          cor={corSerie(1)}
          spark={temLiq ? emPct(sp.liquidado) : undefined}
          hint={temLiq ? `${pctTexto(d.pctLiquidado)} do empenhado` : "Sem acesso às Liquidações"}
          detalhes={
            temLiq
              ? [
                  { rotulo: "Liquidações", valor: num(t.liquidacoes) },
                  { rotulo: "Anulado", valor: brl(reais(t.liqAnulado)), cor: t.liqAnulado ? "var(--danger)" : undefined },
                ]
              : undefined
          }
          onClick={temLiq ? () => abrirTudo("liquidacoes", "Liquidado") : undefined}
          acao="ver as liquidações"
        />
        <KpiStat
          label="Pago"
          value={temPag ? brl(pagoAnim) : "—"}
          completo
          cor={corSerie(2)}
          spark={temPag ? emPct(sp.pago) : undefined}
          hint={temPag ? `${pctTexto(d.pctPago)} do empenhado` : "Sem acesso aos Pagamentos"}
          detalhes={
            temPag
              ? [
                  { rotulo: "Ordens", valor: num(t.pagamentos) },
                  { rotulo: "Pago líquido", valor: brl(reais(t.pagoLiquido)) },
                ]
              : undefined
          }
          onClick={temPag ? () => abrirTudo("pagamentos", "Pago") : undefined}
          acao="ver os pagamentos"
        />
        {safra ? (
          <KpiStat
            label="A pagar"
            value={temPag ? brl(quartoAnim) : "—"}
            completo
            cor="var(--warn)"
            hint={temPag ? "Empenhado − pago" : "Sem acesso aos Pagamentos"}
            detalhes={[
              ...(temLiq ? [{ rotulo: "A liquidar", valor: brl(reais(d.aLiquidar)) }] : []),
              ...(temLiq && temPag ? [{ rotulo: "Liquidado a pagar", valor: brl(reais(d.liquidadoAPagar)) }] : []),
            ]}
            onClick={() => abrirTudo("empenhos", "A pagar")}
            acao="ver os empenhos"
          />
        ) : (
          <KpiStat
            label="Retido"
            value={temPag ? brl(quartoAnim) : "—"}
            completo
            cor="var(--info)"
            hint={temPag ? "Retenções das ordens pagas" : "Sem acesso aos Pagamentos"}
            detalhes={
              temPag
                ? [
                    { rotulo: "Ordens anuladas", valor: num(t.pagAnuladas) },
                    { rotulo: "Valor anulado", valor: brl(reais(t.pagAnulado)), cor: t.pagAnulado ? "var(--danger)" : undefined },
                  ]
                : undefined
            }
            onClick={temPag ? () => abrirTudo("pagamentos", "Retido") : undefined}
            acao="ver os pagamentos"
          />
        )}
      </div>

      <div className="flex justify-center">
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={mais}
          onClick={() =>
            setMais((m) => {
              try {
                localStorage.setItem(CHAVE_MAIS, m ? "0" : "1");
              } catch {
                /* sem armazenamento: vale só nesta visita */
              }
              return !m;
            })
          }
          icon={<IconChevronDown className={`h-4 w-4 transition-transform ${mais ? "rotate-180" : ""}`} />}
        >
          {mais ? "Menos indicadores" : "Mais indicadores"}
        </Button>
      </div>
      {mais && (
        <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-3 lg:grid-cols-6">
          <StatMini label="Empenhos" value={num(t.empenhos)} hint={`${plural(t.fornecedores, "fornecedor", "fornecedores")}`} />
          <StatMini label="Ticket médio" value={t.empenhos ? brl(reais(t.empenhado) / t.empenhos) : "—"} hint="Empenhado por empenho" />
          {temLiq && <StatMini label="Liquidado bruto" value={brl(reais(t.liqBruto))} hint={plural(t.liquidacoes, "liquidação", "liquidações")} />}
          {temPag && <StatMini label="Ordens anuladas" value={num(t.pagAnuladas)} hint={brl(reais(t.pagAnulado))} tone={t.pagAnuladas ? "warn" : "default"} />}
          <StatMini
            label="Sem empenho no sistema"
            value={brl(reais(t.semEmpenhoValor))}
            hint={`${plural(t.semEmpenho, "registro", "registros")} (restos a pagar)`}
            tone={t.semEmpenho ? "warn" : "default"}
          />
          <StatMini
            label="Sem data"
            value={num(calc.semData.empenhos + calc.semData.liquidacoes + calc.semData.pagamentos)}
            hint="Fora da série (só em Todo o período)"
          />
        </div>
      )}

      <section
        aria-label="Filtros da execução"
        className={`space-y-2 rounded-card border p-[var(--pad-card)] transition-colors ${chips.length ? "border-accent/30 bg-accent-soft/40" : "border-border bg-surface"}`}
      >
        <FiltrosDashboard campos={campos} onMudar={mudarFiltro} principais={DIMS_PRINCIPAIS} />
        {chips.length > 0 && (
          <div className="flex min-h-9 flex-wrap items-center gap-2" aria-live="polite">
            <IconFilter className="h-4 w-4 shrink-0 text-accent" aria-hidden />
            {chips.map((c) => (
              <span key={`${c.dim}:${c.chave}`} className="inline-flex max-w-full items-center gap-1 rounded-chip border border-accent/30 bg-surface pl-2.5 text-xs text-text">
                <span className="text-muted">{ROTULO_DIM[c.dim]}:</span>
                <span className="truncate font-medium" title={c.rotulo}>
                  {c.rotulo}
                </span>
                <button
                  type="button"
                  aria-label={`Tirar o filtro ${ROTULO_DIM[c.dim]}: ${c.rotulo}`}
                  title="Tirar este filtro"
                  onClick={() => tirarChip(c.dim, c.chave)}
                  className="grid h-7 w-7 place-items-center rounded-chip text-muted hover:text-text pointer-coarse:h-11 pointer-coarse:w-11"
                >
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setFiltros({})} title="Tirar todos os filtros">
              Limpar
            </Button>
          </div>
        )}
      </section>

      <ChartCard title="Funil da execução" subtitle={safra ? "Dos empenhos do período: quanto já foi liquidado e pago" : "O que foi empenhado, liquidado e pago no período"}>
        <BarrasH
          ariaLabel="Funil da execução"
          acao="ver a origem dos dados"
          onEscolher={(k) => abrirTudo(k as Aba, k === "empenhos" ? "Empenhado" : k === "liquidacoes" ? "Liquidado" : "Pago")}
          linhas={[
            {
              chave: "empenhos",
              rotulo: "Empenhado",
              titulo: `Empenhado: ${brl(reais(t.empenhado))}`,
              segmentos: [{ chave: "e", valor: Math.max(0, t.empenhado), cor: corSerie(0), rotulo: "Empenhado" }],
              valor: brlCompact(reais(t.empenhado)),
              detalhe: "100%",
            },
            ...(temLiq
              ? [
                  {
                    chave: "liquidacoes",
                    rotulo: "Liquidado",
                    titulo: `Liquidado: ${brl(reais(t.liquidado))}`,
                    segmentos: [{ chave: "l", valor: Math.max(0, t.liquidado), cor: corSerie(1), rotulo: "Liquidado" }],
                    valor: brlCompact(reais(t.liquidado)),
                    detalhe: pctTexto(d.pctLiquidado),
                  },
                ]
              : []),
            ...(temPag
              ? [
                  {
                    chave: "pagamentos",
                    rotulo: "Pago",
                    titulo: `Pago: ${brl(reais(t.pago))}`,
                    segmentos: [{ chave: "p", valor: Math.max(0, t.pago), cor: corSerie(2), rotulo: "Pago" }],
                    valor: brlCompact(reais(t.pago)),
                    detalhe: pctTexto(d.pctPago),
                  },
                ]
              : []),
          ]}
        />
        {!safra && (temLiq || temPag) && (
          <p className="mt-2 text-[11.5px] text-muted">
            No movimento, o liquidado e o pago incluem os restos a pagar (empenhos de anos anteriores) — por isso podem passar do empenhado. Para a
            execução dos empenhos do período, use “Por empenho”.
          </p>
        )}
      </ChartCard>

      <ChartCard
        title={modo === "acumulado" ? "Evolução acumulada" : `Valores por ${rotuloGran}`}
        subtitle={`${modo === "acumulado" ? "Somando desde o início do período" : "O que entrou em cada balde"} · toque num ponto para ver a origem`}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Segmented<"diario" | "acumulado">
            value={modo}
            onChange={setModo}
            ariaLabel="Tipo do gráfico"
            options={[
              { value: "acumulado", label: "Acumulada", dica: "A soma desde o início do período (áreas)" },
              { value: "diario", label: "Por período", curto: "Período", dica: "O valor de cada dia, semana ou mês (colunas)" },
            ]}
          />
          <Segmented<Granularidade>
            value={gran}
            onChange={setGran}
            ariaLabel="Granularidade do gráfico"
            options={[
              { value: "auto", label: "Auto", dica: "Pelo tamanho do período: dias, semanas ou meses" },
              { value: "dia", label: "Dia" },
              { value: "semana", label: "Semana" },
              { value: "mes", label: "Mês" },
            ]}
          />
          <Button size="sm" variant="secondary" className="ml-auto" aria-pressed={verDados} onClick={() => setVerDados((v) => !v)} icon={<IconLayers className="h-4 w-4" />}>
            {verDados ? "Ver gráfico" : "Ver dados"}
          </Button>
        </div>
        {verDados ? (
          <DataTable
            rows={s.pontos}
            getKey={(p) => p.chave}
            density="compact"
            exportar={podeExportar ? { nome: `Execução por ${rotuloGran}` } : false}
            onRowClick={(p) => abrirOrigem(modo === "acumulado" ? "Evolução acumulada" : `Valores por ${rotuloGran}`, p.titulo, selecaoNoIntervalo(base, calc.sel, p.de, p.ate), "empenhos")}
            columns={colunasSerie(temLiq, temPag)}
            vazio="Nada no período escolhido."
          />
        ) : (
          <SerieTemporal
            pontos={pontos}
            series={seriesVistas.map((x) => ({ ...x }))}
            modo={modo === "acumulado" ? "areas" : "colunas"}
            ariaLabel={modo === "acumulado" ? "Evolução acumulada do empenhado, liquidado e pago" : `Empenhado, liquidado e pago por ${rotuloGran}`}
            onEscolher={(p) => {
              const pt = s.pontos.find((x) => x.chave === p.chave);
              if (pt) abrirOrigem(modo === "acumulado" ? "Evolução acumulada" : `Valores por ${rotuloGran}`, pt.titulo, selecaoNoIntervalo(base, calc.sel, pt.de, pt.ate), "empenhos");
            }}
            extraDica={(p, vis) => {
              if (modo !== "acumulado") return [];
              const e = p.valores.empenhado ?? 0;
              const l: { rotulo: string; valor: string }[] = [];
              if (vis.has("liquidado") && e > 0) l.push({ rotulo: "Liquidado / empenhado", valor: pctTexto((p.valores.liquidado ?? 0) / e) });
              if (vis.has("pago") && e > 0) l.push({ rotulo: "Pago / empenhado", valor: pctTexto((p.valores.pago ?? 0) / e) });
              if (vis.has("pago") && vis.has("empenhado")) l.push({ rotulo: "Diferença empenhado − pago", valor: brl(e - (p.valores.pago ?? 0)) });
              return l;
            }}
          />
        )}
      </ChartCard>

      {origem && (
        <OrigemExecucao
          base={base}
          origem={origem}
          safra={safra}
          temLiq={temLiq}
          temPag={temPag}
          podeExportar={podeExportar}
          onClose={() => setOrigem(null)}
          onEmpenho={(i) => setEmpenho(paraTela(empenhoExec(base, i)))}
        />
      )}
      <EmpenhoBanner empenho={empenho} onClose={() => setEmpenho(null)} />
    </div>
  );
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

/** A faixa de CONFIANÇA: de quando são os dados, o recorte e o que pede atenção. */
function FaixaConfianca({ atualizado, avisos, recorte, carregando }: { atualizado: string | null; avisos: string[]; recorte: string; carregando: boolean }) {
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <IconDatabase className="h-3.5 w-3.5" aria-hidden />
          {atualizado ? `Dados da Centi importados até ${dataHoraBR(atualizado)}` : "Nenhuma importação concluída"}
        </span>
        <span className="tabular-nums">{recorte}</span>
        {carregando && <span className="text-accent">Atualizando…</span>}
      </p>
      {avisos.length > 0 && (
        <Callout kind="warn" icon={<IconInfo className="h-4 w-4" />}>
          <ul className="list-disc space-y-0.5 pl-4">
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Callout>
      )}
    </div>
  );
}

/** A ORIGEM de um número: as abas Empenhos · Liquidações · Pagamentos com as linhas que o formam. */
function OrigemExecucao({
  base,
  origem,
  safra,
  temLiq,
  temPag,
  podeExportar,
  onClose,
  onEmpenho,
}: {
  base: BaseExec;
  origem: Origem;
  safra: boolean;
  temLiq: boolean;
  temPag: boolean;
  podeExportar: boolean;
  onClose: () => void;
  onEmpenho: (i: number) => void;
}) {
  const [aba, setAba] = useState<Aba>(origem.aba);
  const empenhos = useMemo(() => Array.from(origem.sel.emp, (i) => ({ i, ...empenhoExec(base, i) })), [base, origem.sel.emp]);
  const liqs = useMemo(() => (temLiq ? Array.from(origem.sel.liq, (k) => liquidacaoExec(base, k)) : []), [base, origem.sel.liq, temLiq]);
  const pags = useMemo(() => (temPag ? Array.from(origem.sel.pag, (k) => pagamentoExec(base, k)) : []), [base, origem.sel.pag, temPag]);
  const soma = <T,>(l: T[], f: (x: T) => number) => l.reduce((t, x) => t + f(x), 0);
  const emp = soma(empenhos, (e) => e.valorEmpenhado - e.valorAnulado);
  const liq = soma(liqs, (l) => l.valor);
  const pag = soma(pags, (p) => p.valor);
  const qLiq = soma(liqs, (l) => l.quantidade);
  const qPag = soma(pags, (p) => p.quantidade);
  return (
    <OrigemDados
      aberto
      onClose={onClose}
      titulo={origem.titulo}
      recorte={origem.recorte}
      resumo={[
        { label: "Empenhado", value: brl(emp), hint: plural(empenhos.length, "empenho", "empenhos") },
        ...(temLiq ? [{ label: "Liquidado", value: brl(liq), hint: plural(qLiq, "liquidação", "liquidações") }] : []),
        ...(temPag ? [{ label: "Pago", value: brl(pag), hint: plural(qPag, "ordem", "ordens") }] : []),
      ]}
      fonte={
        <>
          Empenhos, liquidações e pagamentos importados da Centi, ligados pelo número do empenho.{" "}
          {safra ? "Visão por empenho: os empenhos do recorte e toda a execução deles." : "Visão por movimento: cada etapa pela própria data."} As liquidações e os
          pagamentos aparecem somados por empenho e dia.
        </>
      }
    >
      <Segmented<Aba>
        value={aba}
        onChange={setAba}
        ariaLabel="Etapa da origem"
        className="mb-3"
        options={[
          { value: "empenhos", label: `Empenhos (${num(empenhos.length)})`, curto: "Empenhos" },
          ...(temLiq ? [{ value: "liquidacoes" as const, label: `Liquidações (${num(qLiq)})`, curto: "Liquidações" }] : []),
          ...(temPag ? [{ value: "pagamentos" as const, label: `Pagamentos (${num(qPag)})`, curto: "Pagamentos" }] : []),
        ]}
      />
      {aba === "empenhos" ? (
        <DataTable
          rows={empenhos}
          getKey={(e) => e.i}
          density="compact"
          exportar={podeExportar ? { nome: `Origem - empenhos - ${origem.recorte}` } : false}
          onRowClick={(e) => onEmpenho(e.i)}
          columns={COLUNAS_EMP}
          vazio="Nenhum empenho neste recorte."
          resumo={(l) => `${plural(l.length, "empenho", "empenhos")} · ${brl(l.reduce((x, e) => x + e.valorEmpenhado - e.valorAnulado, 0))}`}
        />
      ) : (
        <DataTable
          rows={aba === "liquidacoes" ? liqs : pags}
          getKey={(e) => e.chave}
          density="compact"
          exportar={podeExportar ? { nome: `Origem - ${aba} - ${origem.recorte}` } : false}
          onRowClick={(e) => e.ei >= 0 && onEmpenho(e.ei)}
          columns={aba === "liquidacoes" ? COLUNAS_LIQ : COLUNAS_PAG}
          vazio={aba === "liquidacoes" ? "Nenhuma liquidação neste recorte." : "Nenhum pagamento neste recorte."}
          resumo={(l) => `${num(l.reduce((x, e) => x + e.quantidade, 0))} registros · ${brl(l.reduce((x, e) => x + e.valor, 0))}`}
        />
      )}
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

/** O (?) da tela: as visões, as contas de cada número e o que fica de fora. */
function AjudaExecucao() {
  return (
    <Ajuda titulo="Execução da despesa" botao="sm">
      <TopicoAjuda icone={<IconLayers className="h-4 w-4" />} titulo="Movimento × Por empenho">
        Movimento: cada etapa pela própria data — o que foi empenhado, liquidado e pago no período (inclui os restos a pagar de anos anteriores).
        Por empenho: os empenhos do período e toda a execução deles, de qualquer data; mostra o que falta liquidar e pagar.
      </TopicoAjuda>
      <TopicoAjuda icone={<IconInfo className="h-4 w-4" />} titulo="As contas">
        Empenhado = valor empenhado − anulado (a anulação não tem data na Centi: fica na data do empenho). Liquidado = valor das liquidações −
        anulado. Pago = valor das ordens de pagamento não anuladas; o retido e o pago líquido também só das não anuladas. Cada registro da Centi
        conta uma vez, mesmo que esteja em dois cards.
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
