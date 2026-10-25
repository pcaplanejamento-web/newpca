"use client";

import dynamic from "next/dynamic";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { EmpenhoNaTela } from "@/lib/empenhos-tela-core";
import {
  anosDoIntervalo,
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
  ROTULO_DIM,
  rotuloOpcao,
  type Selecao,
  selecaoNoIntervalo,
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
import type { PontoTemporal } from "./charts/SerieTemporal";
import { corSerie } from "./charts/shared";
import { type Column, DataTable, FiltrosAtivos } from "./DataTable";
import { EmpenhoBanner } from "./EmpenhoDetalhe";
import { ErroCarga } from "./ErroCarga";
import { FiltrosDashboard } from "./FiltrosDashboard";
import { IconChevronDown, IconDatabase, IconInfo, IconLayers, IconRestaurar, IconZoom, IconZoomOut } from "./icons";
import { KpiStat } from "./KpiStat";
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
  const [gran, setGran] = useState<Granularidade>("auto");
  const [mais, setMais] = useState(false);
  const [verDados, setVerDados] = useState(false);
  const [origem, setOrigem] = useState<Origem | null>(null);
  const [empenho, setEmpenho] = useState<EmpenhoNaTela | null>(null);
  useEffect(() => setMais(lerMais()), []);

  // Os filtros mudam na hora; o cálculo segue um quadro depois (a tela não trava com centenas de milhares de registros).
  const pedido = useMemo(() => ({ periodo, filtros, tipo }), [periodo, filtros, tipo]);
  const adiado = useDeferredValue(pedido);
  const atrasado = adiado !== pedido || carregando;
  const intervalo = useMemo(() => intervaloDoPeriodo(adiado.periodo, hoje), [adiado.periodo, hoje]);
  const calc: Calculo = useMemo(() => calcular(base, intervalo, adiado.filtros, adiado.tipo), [base, intervalo, adiado.filtros, adiado.tipo]);
  // Os ANOS a carregar seguem o Período (o Ano não é um filtro à parte): mudou o que o Período cobre, pede os anos dele.
  const anosQuer = useMemo(() => anosDoIntervalo(intervaloDoPeriodo(periodo, hoje), base.disponiveis), [periodo, hoje, base.disponiveis]);
  useEffect(() => {
    if (anosQuer.join(",") !== anos.join(",")) onAnos(anosQuer);
  }, [anosQuer, anos, onAnos]);
  const t = calc.totais;
  const d = derivados(t);
  const sp = useMemo(() => sparks(base, calc.sel, hoje), [base, calc.sel, hoje]);
  const s = useMemo(() => serie(base, calc, intervalo, gran, hoje), [base, calc, intervalo, gran, hoje]);
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
        valores:
          modo === "acumulado"
            ? { empenhado: reais(p.acEmpenhado), liquidado: reais(p.acLiquidado), pago: reais(p.acPago) }
            : { empenhado: reais(p.empenhado), liquidado: reais(p.liquidado), pago: reais(p.pago) },
      })),
    [s.pontos, modo],
  );
  // ZOOM pela lupa: a faixa de baldes à vista (null = o período inteiro); outro recorte volta ao todo.
  const [faixa, setFaixa] = useState<[number, number] | null>(null);
  const assinatura = pontos.length ? `${pontos[0].chave}|${pontos.at(-1)?.chave}|${pontos.length}` : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: o zoom volta ao todo quando os baldes mudam.
  useEffect(() => setFaixa(null), [assinatura]);
  const pontosVistos = useMemo(() => (faixa ? pontos.slice(faixa[0], faixa[1] + 1) : pontos), [pontos, faixa]);
  const zoom = (fator: number) => {
    const total = pontos.length;
    const [ini, fim] = faixa ?? [0, total - 1];
    const larg = Math.max(4, Math.round((fim - ini + 1) * fator));
    if (larg >= total) return setFaixa(null);
    const a = Math.max(0, Math.min(total - larg, Math.round((ini + fim) / 2 - larg / 2)));
    setFaixa([a, a + larg - 1]);
  };
  const seriesVistas = useMemo(() => SERIES.filter((x) => (x.chave === "liquidado" ? temLiq : x.chave === "pago" ? temPag : true)), [temLiq, temPag]);
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
        {mais && (
          <div className="animate-fade-in-up grid grid-cols-1 gap-[var(--gap-block)] md:col-span-3 md:grid-cols-3">
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
        )}
      </div>
      <button
        type="button"
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
          antes={<PeriodoPicker value={periodo} anos={base.disponiveis} onChange={setPeriodo} className="w-full min-w-0" />}
        />
      </section>
      {erro && <ErroCarga msg={erro} onTentar={onTentar} kind="warn" />}

      {/* O gráfico: só as ondas (as cores = as dos indicadores; os nomes e valores na dica); os controles dele no próprio cartão. */}
      <ChartCard>
        <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5">
          <Segmented<"diario" | "acumulado">
            value={modo}
            onChange={setModo}
            ariaLabel="Tipo do gráfico"
            options={[
              { value: "acumulado", label: "Acumulado", dica: "O gráfico soma desde o início do período" },
              { value: "diario", label: "Por período", curto: "Período", dica: "O gráfico mostra o valor de cada dia, semana ou mês" },
            ]}
          />
          <Segmented<Granularidade>
            value={gran}
            onChange={setGran}
            ariaLabel="Agrupar o gráfico por"
            options={[
              { value: "auto", label: "Auto", dica: "Pelo tamanho do período: dias, semanas ou meses" },
              { value: "dia", label: "Dia", dica: "Agrupar o gráfico por dia" },
              { value: "semana", label: "Semana", dica: "Agrupar o gráfico por semana" },
              { value: "mes", label: "Mês", dica: "Agrupar o gráfico por mês" },
            ]}
          />
          {!verDados && (
            <>
              <Button size="sm" variant="icon" aria-label="Aproximar" title="Aproximar (menos períodos à vista)" disabled={pontosVistos.length <= 4} onClick={() => zoom(0.5)}>
                <IconZoom className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="icon" aria-label="Afastar" title="Afastar (mais períodos à vista)" disabled={!faixa} onClick={() => zoom(2)}>
                <IconZoomOut className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="icon" aria-label="Restaurar o zoom" title="Restaurar o zoom (o período inteiro)" disabled={!faixa} onClick={() => setFaixa(null)}>
                <IconRestaurar className="h-4 w-4" />
              </Button>
            </>
          )}
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
          <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
          {/* O resumo dos filtros ligados: o MESMO funil das tabelas (✕ tira um; "Limpar" volta tudo ao padrão). O lugar dele
              fica reservado: aparecer ou sumir não desloca os botões ao lado. */}
          <span className="inline-flex h-11 w-11 shrink-0 lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]">
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
          <Avisos titulo="Avisos dos dados" avisos={avisos} />
          <AjudaExecucao />
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
            pontos={pontosVistos}
            series={seriesVistas}
            ariaLabel={modo === "acumulado" ? "Evolução acumulada do empenhado, liquidado e pago" : `Empenhado, liquidado e pago por ${rotuloGran}`}
            onEscolher={(p) => {
              const pt = s.pontos.find((x) => x.chave === p.chave);
              if (pt) abrirOrigem(modo === "acumulado" ? "Evolução acumulada" : `Valores por ${rotuloGran}`, pt.titulo, selecaoNoIntervalo(base, calc.sel, pt.de, pt.ate), "empenhos");
            }}
            extraDica={(p) => {
              if (modo !== "acumulado") return [];
              const e = p.valores.empenhado ?? 0;
              const l: { rotulo: string; valor: string }[] = [];
              if (temLiq && e > 0) l.push({ rotulo: "Liquidado / empenhado", valor: pctTexto((p.valores.liquidado ?? 0) / e) });
              if (temPag && e > 0) l.push({ rotulo: "Pago / empenhado", valor: pctTexto((p.valores.pago ?? 0) / e) });
              if (temPag) l.push({ rotulo: "Diferença empenhado − pago", valor: brl(e - (p.valores.pago ?? 0)) });
              return l;
            }}
          />
        )}
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

/** A ORIGEM de um número: as abas Empenhos · Liquidações · Pagamentos com as linhas que o formam. */
function OrigemExecucao({
  base,
  origem,
  temLiq,
  temPag,
  podeExportar,
  onClose,
  onEmpenho,
}: {
  base: BaseExec;
  origem: Origem;
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
          Cada etapa pela própria data (os restos a pagar inclusive). As liquidações e os
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
