"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { blocosRelatorioDashboard } from "@/lib/dashboard-relatorio";
import { brl, brlCompact, dataIsoBrasilia, mesLabel, num } from "@/lib/format";
import {
  agregarItensDash,
  alternarFiltro,
  chavesDoFiltro,
  cronogramaDash,
  type DimTopo,
  fatiasDash,
  type ModoCronograma,
  type DimDash,
  type FiltrosDash,
  filtrarItensDash,
  mesesDoRecorte,
  opcoesDash,
  type RecorteDash,
  recorteDasChaves,
  rotuloVarios,
  temFiltro,
} from "@/lib/origem-dash";
import type { DfdDoPca, DfdForaDaSoma, ProtocoloDoPca } from "@/lib/pca-espaco";
import type { PontoSerie } from "@/lib/ranking-grafico";
import type { Fatia, ItemRow, PontoMensal, Resumo, TopItem } from "@/lib/queries";
import { BannersConsulta } from "./BannersConsulta";
import type { AberturaMesa } from "./BannersMesa";
import { Button } from "./Button";
import { ChartCard } from "./ChartCard";
import { ClassificacaoChart } from "./charts/ClassificacaoChart";
import { MensalChart } from "./charts/MensalChart";
import { PRIORIDADES_DASH, PrioridadeChart, rotuloPrioridade } from "./charts/PrioridadeChart";
import { TopItensChart } from "./charts/TopItensChart";
import { UnidadeChart } from "./charts/UnidadeChart";
import { UnidadeRequisitanteChart } from "./charts/UnidadeRequisitanteChart";
import { useQuemExporta } from "./ConfigTabelas";
import { ConsultaPca } from "./ConsultaPca";
import { ExploradorGrafico } from "./ExploradorGrafico";
import { type CampoFiltroDash, FiltrosDashboard } from "./FiltrosDashboard";
import { usePodeExportar } from "./ExportarTabelas";
import { IconClose, IconDownload, IconFilter } from "./icons";
import { ItemTable } from "./ItemTable";
import { KpiStat } from "./KpiStat";
import { OrigemDados } from "./OrigemDados";
import { Segmented } from "./Segmented";
import { toast } from "./Toast";
import { useContagem } from "./useContagem";

/** Consulta do PCA de fonte protocolo (Protocolos · DFDs · Itens + banners discretos); `foraDaSoma` = os DFDs que a
 * consolidação deixou fora (só no painel; ausente na tela pública). */
export type ConsultaDashboard = { pcaId: number; protocolos: ProtocoloDoPca[]; dfds: DfdDoPca[]; foraDaSoma?: DfdForaDaSoma[] };

type Grafico = DimDash;

const TITULO: Record<Grafico, string> = {
  classificacao: "Classificação dos Itens",
  mes: "Cronograma Mensal",
  item: "Top 100 Itens por Valor",
  unidadeMedida: "Unidades de Medida",
  prioridade: "Prioridade dos DFDs",
  unidade: "Valor por Unidade",
};

/** O ranking do gráfico de itens (o explorador também — o resto fica na Consulta de itens). */
const TOP_ITENS = 100;

/** O texto de uma opção dos menus do topo. */
function rotuloOpcao(dim: DimTopo, chave: string): string {
  if (dim === "mes") {
    const [a, m] = chave.split("-").map(Number);
    return m === 0 ? `Anuais de ${a}` : mesLabel(m, a);
  }
  if (dim === "prioridade") return rotuloPrioridade(chave);
  if (chave !== "—") return chave;
  return dim === "classificacao" ? "Sem classificação" : "Sem unidade";
}

/** O nome curto de cada filtro no chip. */
const TITULO_CHIP: Record<Grafico, string> = {
  classificacao: "Classificação",
  mes: "Mês",
  item: "Item",
  unidadeMedida: "Unidade de medida",
  prioridade: "Prioridade",
  unidade: "Unidade",
};

/** A ordem dos menus do topo e o nome de cada um. */
const DIMS_TOPO: { dim: DimTopo; rotulo: string }[] = [
  { dim: "classificacao", rotulo: "Classificação" },
  { dim: "mes", rotulo: "Mês" },
  { dim: "prioridade", rotulo: "Prioridade" },
  { dim: "unidade", rotulo: "Unidade" },
  { dim: "unidadeMedida", rotulo: "Unidade de medida" },
];

/**
 * KPIs + FILTROS + abas GRÁFICOS | CONSULTA DE ITENS do Dashboard do PCA (painel e tela inicial) — UM cliente, p/ os
 * itens trafegarem uma vez só. Os FILTROS do topo (menus suspensos de seleção múltipla por dimensão, opções conectadas
 * com a contagem — `opcoesDash`) e o toque nos gráficos ligam os MESMOS filtros. Os KPIs correm até o valor novo
 * (`useContagem`); os cartões entram em sequência; o gráfico de itens é o TOP 100 (a lista rola por dentro).
 * FILTRO CRUZADO: tocar numa fatia/barra/legenda FILTRA os demais gráficos, os KPIs e a Consulta (um filtro por gráfico,
 * E entre eles — `origem-dash.ts`; cada gráfico mostra todas as próprias categorias com a escolhida em destaque). Os
 * filtros ficam em chips removíveis, com "Ver origem" (os itens que formam os números) e "Limpar". Sem filtro, valem os
 * números do servidor; com filtro, a MESMA agregação roda aqui (`agregarItensDash`). Cada gráfico EXPANDE no
 * explorador (ranking, detalhe com a posição e a participação, tabela e PNG). As cores das categorias são as mesmas com
 * ou sem filtro.
 */
export function DashboardPcaCliente({
  resumo,
  porClassificacao,
  porMes,
  porUnidadeMedida,
  itensTexto,
  showUnidade,
  hintItens,
  unidadeFiltrada = false,
  consulta,
  previa = false,
  nome,
}: {
  resumo: Resumo;
  porClassificacao: Fatia[];
  porMes: PontoMensal[];
  porUnidadeMedida: Fatia[];
  /** TODOS os itens do PCA num texto JSON (`ItemRow[]`) — lido UMA vez aqui (milhares de linhas sem serializar valor a valor). */
  itensTexto: string;
  showUnidade: boolean;
  hintItens?: string;
  unidadeFiltrada?: boolean;
  consulta?: ConsultaDashboard;
  /** PRÉVIA ligada: a lista inclui os DFDs ainda não incorporados (a fonte da origem diz). */
  previa?: boolean;
  /** O nome do PCA (o título do relatório em PDF). */
  nome?: string;
}) {
  const itens = useMemo(() => JSON.parse(itensTexto) as ItemRow[], [itensTexto]);
  const [filtros, setFiltros] = useState<FiltrosDash>({});
  const [origemAberta, setOrigemAberta] = useState(false);
  const [explorar, setExplorar] = useState<Grafico | null>(null);
  const [aberto, setAberto] = useState<AberturaMesa | null>(null);
  const [modoCrono, setModoCrono] = useState<ModoCronograma>("mensal");
  const [gerando, setGerando] = useState(false);
  const [aba, setAba] = useState<"graficos" | "consulta">("graficos");
  const podeExportar = usePodeExportar();
  const quem = useQuemExporta();
  const ativo = temFiltro(filtros);
  const rotuloUnidade = consulta ? "Unidade requisitante" : "Planilha";

  // Cada gráfico SEM o filtro da própria dimensão; sem filtro nenhum, os números do servidor.
  const dados = useMemo(() => {
    const de = (dim: DimDash) => agregarItensDash(filtrarItensDash(itens, filtros, dim));
    if (!ativo) return null;
    return { classificacao: de("classificacao"), unidadeMedida: de("unidadeMedida") };
  }, [itens, filtros, ativo]);
  const filtrados = useMemo(() => (ativo ? filtrarItensDash(itens, filtros) : itens), [itens, filtros, ativo]);
  const resumoVisto: Resumo = useMemo(() => (ativo ? agregarItensDash(filtrados).resumo : resumo), [ativo, filtrados, resumo]);
  const maior = useMemo(() => {
    let m: ItemRow | null = null;
    for (const i of filtrados) if (!m || (i.valorTotal ?? 0) > (m.valorTotal ?? 0)) m = i;
    return m;
  }, [filtrados]);

  const kTotal = useContagem(resumoVisto.total);
  const kCount = useContagem(resumoVisto.count);
  const kTicket = useContagem(resumoVisto.ticket);
  const kMaior = useContagem(resumoVisto.maiorValor);

  const classes = dados?.classificacao.porClassificacao ?? porClassificacao;
  // Os maiores itens por valor (sem o filtro de item — o escolhido fica em destaque entre eles).
  const ordenados = useMemo(
    () =>
      (ativo ? filtrarItensDash(itens, filtros, "item") : itens)
        .filter((i) => (i.valorTotal ?? 0) > 0)
        .sort((a, b) => (b.valorTotal ?? 0) - (a.valorTotal ?? 0))
        .slice(0, TOP_ITENS),
    [itens, filtros, ativo],
  );
  const tops: TopItem[] = useMemo(
    () => ordenados.map((i) => ({ id: i.id, nome: i.nomeProduto, valor: i.valorTotal ?? 0, quantidade: i.quantidade, unidadeMedida: i.unidadeMedida, codigo: i.idProduto })),
    [ordenados],
  );
  const unids = dados?.unidadeMedida.porUnidadeMedida ?? porUnidadeMedida;
  // Prioridade e unidade: sempre no navegador (o servidor não as agrega), cada uma SEM o filtro da própria dimensão.
  const prioridades = useMemo(() => fatiasDash(filtrarItensDash(itens, filtros, "prioridade"), "prioridade"), [itens, filtros]);
  const unidades = useMemo(() => fatiasDash(filtrarItensDash(itens, filtros, "unidade"), "unidade"), [itens, filtros]);
  const temPrioridade = useMemo(() => itens.some((i) => i.prioridade), [itens]);
  const temUnidades = unidades.filter((f) => f.label !== "—").length > 1 || filtros.unidade != null;
  const temAnuais = useMemo(() => itens.some((i) => i.anual), [itens]);
  const cronograma = useMemo(
    () => (modoCrono === "mensal" && !ativo ? porMes : cronogramaDash(ativo ? filtrarItensDash(itens, filtros, "mes") : itens, modoCrono)),
    [modoCrono, ativo, porMes, itens, filtros],
  );

  // A cor de cada classificação pela ordem SEM filtro — a mesma categoria guarda a cor.
  const indiceCor = useMemo(() => new Map(porClassificacao.map((f, i) => [f.label, i])), [porClassificacao]);
  const corDe = (label: string) => indiceCor.get(label) ?? -1;
  const corPrioridade = (chave: string) => PRIORIDADES_DASH.find((p) => p.chave === chave)?.cor ?? "var(--faint)";

  const filtrar = (r: RecorteDash, rotulo: string) => setFiltros((f) => alternarFiltro(f, r, rotulo));
  const labels = (dim: "classificacao" | "unidadeMedida" | "prioridade" | "unidade") => {
    const r = filtros[dim]?.recorte;
    return r && r.dim === dim ? r.labels : undefined;
  };
  const mesesAtivos = mesesDoRecorte(filtros.mes?.recorte);
  const itemAtivo = (() => {
    const r = filtros.item?.recorte;
    return r?.dim === "item" ? r.id : null;
  })();

  // Os menus do topo: as opções CONECTADAS (os demais filtros valem) com o texto de cada uma.
  const campos: CampoFiltroDash[] = useMemo(
    () =>
      DIMS_TOPO.filter((d) => (d.dim === "prioridade" ? temPrioridade : d.dim === "unidade" ? temUnidades : true)).map((d) => ({
        dim: d.dim,
        rotulo: d.dim === "unidade" ? rotuloUnidade : d.rotulo,
        opcoes: opcoesDash(itens, filtros, d.dim).map((o) => ({ ...o, rotulo: rotuloOpcao(d.dim, o.chave) })),
        selecionados: chavesDoFiltro(filtros, d.dim),
      })),
    [itens, filtros, temPrioridade, temUnidades, rotuloUnidade],
  );
  function mudarTopo(dim: string, chaves: string[]) {
    const d = dim as DimTopo;
    const recorte = recorteDasChaves(d, chaves);
    setFiltros((f) => {
      const n = { ...f };
      if (recorte) n[d] = { recorte, rotulo: rotuloVarios(chaves.map((c) => rotuloOpcao(d, c))) };
      else delete n[d];
      return n;
    });
  }

  // Consulta: com filtro, os itens filtrados e os DFDs/protocolos que têm itens no filtro.
  const consultaVista = useMemo(() => {
    if (!consulta || !ativo) return consulta;
    const dfdsIds = new Set(filtrados.map((i) => i.dfdId).filter((x): x is number => x != null));
    const dfds = consulta.dfds.filter((d) => dfdsIds.has(d.id));
    const protos = new Set(dfds.map((d) => d.protocoloId).filter((x): x is number => x != null));
    return { ...consulta, dfds, protocolos: consulta.protocolos.filter((p) => protos.has(p.id)) };
  }, [consulta, ativo, filtrados]);

  const abrirItem = consulta
    ? (r: ItemRow) => r.dfdId != null && setAberto({ tipo: "item", dfdId: r.dfdId, itemId: r.id, item: { item: r.itemNumero ?? null, codigo: r.idProduto } })
    : undefined;
  const chips = Object.entries(filtros).filter(([, f]) => f) as [DimDash, NonNullable<FiltrosDash[DimDash]>][];
  const textoFiltros = chips.map(([dim, f]) => `${TITULO_CHIP[dim]}: ${f.rotulo}`).join(" · ");
  const valorFiltrado = filtrados.reduce((s, i) => s + (i.valorTotal ?? 0), 0);
  const anuaisNoMes = filtros.mes ? filtrados.filter((i) => i.anual).length : 0;

  // A série do explorador do gráfico aberto (todas as categorias — as pequenas também).
  const serieExplorar = useMemo((): PontoSerie[] => {
    if (explorar === "classificacao") return classes.map((f) => ({ chave: f.label, rotulo: f.label, valor: f.total, count: f.count }));
    if (explorar === "mes") {
      // No acumulado, o ranking é o de cada mês (a soma corrida não se compara).
      const base = modoCrono === "acumulado" ? cronogramaDash(ativo ? filtrarItensDash(itens, filtros, "mes") : itens, "mensal") : cronograma;
      return base.map((p) => ({ chave: `${p.ano}-${p.mes}`, rotulo: p.mes === 0 ? `Anuais de ${p.ano}` : mesLabel(p.mes, p.ano), valor: p.total, count: p.count }));
    }
    if (explorar === "unidadeMedida") return unids.map((f) => ({ chave: f.label, rotulo: f.label, valor: f.count }));
    if (explorar === "prioridade") return prioridades.map((f) => ({ chave: f.label, rotulo: rotuloPrioridade(f.label), valor: f.total, count: f.count }));
    if (explorar === "unidade") return unidades.map((f) => ({ chave: f.label, rotulo: f.label === "—" ? "Sem unidade" : f.label, valor: f.total, count: f.count }));
    if (explorar === "item") return ordenados.map((i) => ({ chave: String(i.id), rotulo: i.nomeProduto ?? `Item ${i.id}`, valor: i.valorTotal ?? 0 }));
    return [];
  }, [explorar, classes, cronograma, modoCrono, unids, prioridades, unidades, itens, filtros, ativo, ordenados]);

  async function relatorio() {
    if (gerando) return;
    setGerando(true);
    try {
      const [{ baixarDocumentoPdf }, { nomeArquivoPdf }] = await Promise.all([import("@/lib/documento-pdf"), import("@/lib/exportar-pdf-core")]);
      const titulo = `Dashboard${nome ? ` — ${nome}` : " do PCA"}`;
      const mensal = cronogramaDash(ativo ? filtrarItensDash(itens, filtros, "mes") : itens, "mensal");
      await baixarDocumentoPdf(
        nomeArquivoPdf(titulo, dataIsoBrasilia(new Date().toISOString())),
        {
          titulo,
          blocos: blocosRelatorioDashboard({
            titulo,
            filtros: textoFiltros,
            resumo: resumoVisto,
            graficos: [
              { titulo: TITULO.classificacao, rotulo: "Classificação", fatias: classes },
              { titulo: TITULO.mes, rotulo: "Mês", fatias: mensal.map((p) => ({ label: p.mes === 0 ? `Anuais de ${p.ano}` : mesLabel(p.mes, p.ano), total: p.total, count: p.count })) },
              ...(temPrioridade ? [{ titulo: TITULO.prioridade, rotulo: "Prioridade", fatias: prioridades.map((f) => ({ ...f, label: rotuloPrioridade(f.label) })) }] : []),
              ...(temUnidades ? [{ titulo: `Valor por ${rotuloUnidade}`, rotulo: rotuloUnidade, fatias: unidades.map((f) => ({ ...f, label: f.label === "—" ? "Sem unidade" : f.label })) }] : []),
              { titulo: TITULO.unidadeMedida, rotulo: "Unidade de medida", fatias: unids },
              { titulo: TITULO.item, rotulo: "Item", fatias: tops.map((t) => ({ label: t.nome ?? "—", total: t.valor, count: 1 })) },
            ],
          }),
        },
        { usuario: quem },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF.");
    } finally {
      setGerando(false);
    }
  }

  function filtrarDoExplorador(chave: string) {
    if (explorar === "classificacao") filtrar({ dim: "classificacao", labels: [chave] }, chave);
    else if (explorar === "unidadeMedida") filtrar({ dim: "unidadeMedida", labels: [chave] }, chave);
    else if (explorar === "prioridade") filtrar({ dim: "prioridade", labels: [chave] }, rotuloPrioridade(chave));
    else if (explorar === "unidade") filtrar({ dim: "unidade", labels: [chave] }, chave === "—" ? "Sem unidade" : chave);
    else if (explorar === "mes") {
      const [a, m] = chave.split("-").map(Number);
      if (m === 0) filtrar({ dim: "mes", ano: a, mes: 0 }, `Anuais de ${a}`);
      else filtrar({ dim: "mes", ano: a, mes: m, ...(modoCrono === "separado" ? { semAnuais: true } : {}) }, mesLabel(m, a));
    } else if (explorar === "item") {
      const it = itens.find((i) => String(i.id) === chave);
      filtrar({ dim: "item", id: Number(chave) }, it?.nomeProduto ?? `Item ${chave}`);
    }
  }
  const ativaExplorar =
    explorar === "classificacao" || explorar === "unidadeMedida" || explorar === "prioridade" || explorar === "unidade"
      ? (labels(explorar)?.length === 1 ? labels(explorar)?.[0] : null) ?? null
      : explorar === "mes"
        ? mesesAtivos.length === 1
          ? mesesAtivos[0]
          : null
        : explorar === "item"
          ? itemAtivo != null
            ? String(itemAtivo)
            : null
          : null;

  return (
    <>
      <div className="grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-2 xl:grid-cols-4">
        <KpiStat realce label="Total Planejado" value={brlCompact(kTotal)} hint={`em ${num(resumoVisto.count)} itens`} />
        <KpiStat
          realce
          label="Qtd. de Itens"
          value={num(Math.round(kCount))}
          cor="var(--sit-finalizado)"
          hint={ativo ? "itens no filtro" : (hintItens ?? (unidadeFiltrada ? "itens na unidade" : `${num(resumoVisto.numUnidades)} unidade(s)`))}
        />
        <KpiStat realce label="Ticket Médio" value={brl(kTicket)} cor="var(--sit-em-analise)" hint="por item" />
        <KpiStat
          realce
          label="Maior Item"
          value={brlCompact(kMaior)}
          cor="var(--sit-devolvido)"
          hint={resumoVisto.maiorNome ?? "—"}
          onClick={
            maior
              ? () =>
                  abrirItem && maior.dfdId != null
                    ? abrirItem(maior)
                    : filtrar({ dim: "item", id: maior.id }, maior.nomeProduto ?? `Item ${maior.id}`)
              : undefined
          }
          acao={abrirItem ? "abrir o item" : "filtrar pelo item"}
        />
      </div>

      <section
        aria-label="Filtros do Dashboard"
        className={`space-y-2 rounded-card border p-[var(--pad-card)] transition-colors ${ativo ? "border-accent/30 bg-accent-soft/40" : "border-border bg-surface"}`}
      >
        <FiltrosDashboard campos={campos} onMudar={mudarTopo} />
        <div className="flex min-h-9 flex-wrap items-center gap-2" aria-live="polite">
          <IconFilter className={`h-4 w-4 shrink-0 ${ativo ? "text-accent" : "text-faint"}`} aria-hidden />
          {!ativo && <span className="text-xs text-muted">Escolha nos menus ou toque numa fatia/barra — os gráficos, os indicadores e a consulta seguem.</span>}
          {chips.map(([dim, f]) => (
            <span key={dim} className="inline-flex max-w-full animate-fade-in-up items-center gap-1 rounded-chip border border-accent/30 bg-surface pl-2.5 text-xs text-text">
              <span className="text-muted">{TITULO_CHIP[dim]}:</span>
              <span className="truncate font-medium">{f.rotulo}</span>
              <button
                type="button"
                aria-label={`Tirar o filtro ${TITULO_CHIP[dim]}: ${f.rotulo}`}
                title="Tirar este filtro"
                onClick={() =>
                  setFiltros((x) => {
                    const n = { ...x };
                    delete n[dim];
                    return n;
                  })
                }
                className="grid h-7 w-7 place-items-center rounded-chip text-muted hover:text-text pointer-coarse:h-11 pointer-coarse:w-11"
              >
                <IconClose className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1.5">
            {ativo && (
              <>
                <span className="text-xs text-muted tabular-nums">
                  {num(filtrados.length)} itens · {brlCompact(valorFiltrado)}
                </span>
                <Button size="sm" variant="secondary" onClick={() => setOrigemAberta(true)} title="Os itens que formam os números">
                  Ver origem
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setFiltros({})} title="Tirar todos os filtros">
                  Limpar
                </Button>
              </>
            )}
            {podeExportar && (
              <Button size="sm" variant="ghost" onClick={relatorio} loading={gerando} title="Os indicadores e uma tabela por gráfico, com os filtros aplicados">
                <IconDownload className="h-4 w-4" />
                <span className="hidden sm:inline">Relatório (PDF)</span>
              </Button>
            )}
          </span>
        </div>
      </section>

      <Segmented
        value={aba}
        onChange={setAba}
        ariaLabel="Gráficos ou consulta de itens"
        options={[
          { value: "graficos", label: "Gráficos", dica: "Os gráficos do PCA — toque para filtrar, expanda para explorar" },
          { value: "consulta", label: `Consulta de itens (${num(filtrados.length)})`, curto: `Consulta (${num(filtrados.length)})`, dica: "Busque, filtre e ordene os itens (seguem os filtros acima)" },
        ]}
      />

      <div key={aba} className="animate-cat-morph">
        {aba === "graficos" ? (
          <div className="grid grid-cols-1 gap-[var(--gap-block)] lg:grid-cols-2">
            {[
              <ChartCard key="classificacao" title={TITULO.classificacao} subtitle="Valor por categoria — toque para filtrar" onExpandir={() => setExplorar("classificacao")}>
                <ClassificacaoChart data={classes} onSelecionar={filtrar} ativos={labels("classificacao")} corDe={corDe} />
              </ChartCard>,
              <ChartCard key="mes" title={TITULO.mes} subtitle="Valor planejado por mês desejado — toque para filtrar" onExpandir={() => setExplorar("mes")}>
                <MensalChart data={cronograma} onSelecionar={filtrar} ativos={mesesAtivos} modo={modoCrono} onModo={setModoCrono} temAnuais={temAnuais} />
              </ChartCard>,
              <ChartCard key="item" title={TITULO.item} subtitle={`Os ${num(tops.length)} maiores itens — role a lista; toque para filtrar`} onExpandir={() => setExplorar("item")}>
                <TopItensChart data={tops} onSelecionar={filtrar} ativo={itemAtivo} alturaMax={420} />
              </ChartCard>,
              <ChartCard key="unidadeMedida" title={TITULO.unidadeMedida} subtitle="Itens por unidade de medida — toque para filtrar" onExpandir={() => setExplorar("unidadeMedida")}>
                <UnidadeChart data={unids} onSelecionar={filtrar} ativos={labels("unidadeMedida")} />
              </ChartCard>,
              temPrioridade ? (
                <ChartCard key="prioridade" title={TITULO.prioridade} subtitle="Valor dos itens pela prioridade do DFD — toque para filtrar" onExpandir={() => setExplorar("prioridade")}>
                  <PrioridadeChart data={prioridades} onSelecionar={filtrar} ativos={labels("prioridade")} />
                </ChartCard>
              ) : null,
              temUnidades ? (
                <ChartCard key="unidade" title={`Valor por ${rotuloUnidade}`} subtitle="As 10 maiores + as demais — toque para filtrar" onExpandir={() => setExplorar("unidade")}>
                  <UnidadeRequisitanteChart data={unidades} onSelecionar={filtrar} ativos={labels("unidade")} />
                </ChartCard>
              ) : null,
            ]
              .filter(Boolean)
              .map((card, i) => (
                <div key={(card as { key: string }).key} className="grafico-entrada min-w-0 [&>*]:h-full" style={{ "--atraso": `${i * 70}ms` } as CSSProperties}>
                  {card}
                </div>
              ))}
          </div>
        ) : (
          <ChartCard
            title="Consulta de Itens"
            subtitle={
              ativo
                ? `Só o que está no filtro (${num(filtrados.length)} itens) — clique numa linha para ver o detalhe`
                : consulta
                  ? "Itens e DFDs do PCA — clique numa linha para ver o detalhe"
                  : "Busque, filtre e ordene os itens do PCA"
            }
          >
            {consultaVista ? (
              <ConsultaPca
                protocolos={consultaVista.protocolos}
                dfds={consultaVista.dfds}
                foraDaSoma={consultaVista.foraDaSoma}
                itens={filtrados}
                showUnidade={showUnidade}
                aberto={aberto}
                onAbrir={setAberto}
              />
            ) : (
              <ItemTable rows={filtrados} showUnidade={showUnidade} />
            )}
          </ChartCard>
        )}
      </div>

      <ExploradorGrafico
        aberto={explorar != null}
        onClose={() => setExplorar(null)}
        titulo={explorar ? TITULO[explorar] : ""}
        serie={serieExplorar}
        medida={explorar === "unidadeMedida" ? "itens" : "valor"}
        formatar={explorar === "unidadeMedida" ? num : brl}
        corDe={explorar === "classificacao" ? corDe : explorar === "prioridade" ? corPrioridade : undefined}
        ativa={ativaExplorar}
        onFiltrar={filtrarDoExplorador}
        recorte={textoFiltros || undefined}
      />

      <OrigemDados
        aberto={origemAberta}
        onClose={() => setOrigemAberta(false)}
        titulo="Filtros do Dashboard"
        recorte={textoFiltros}
        resumo={[
          { label: "Valor dos itens", value: brl(valorFiltrado) },
          { label: "Itens", value: num(filtrados.length) },
        ]}
        fonte={
          consulta
            ? `Os itens ATIVOS dos DFDs incorporados a este PCA${previa ? " + os da PRÉVIA (ainda não incorporados: enviados e marcados da Mesa do sistema)" : ""} que passam em TODOS os filtros — a mesma lista da Consulta de Itens.`
            : "Os itens das planilhas importadas neste PCA que passam em TODOS os filtros — a mesma lista da Consulta de Itens."
        }
        avisos={[
          anuaisNoMes
            ? `${num(anuaisNoMes)} item(ns) com previsão ANUAL entram no mês com 1/12 do valor no cronograma (a lista mostra o valor cheio).`
            : null,
        ]}
      >
        <ItemTable rows={filtrados} showUnidade={showUnidade} origem={!!consulta} onRowClick={abrirItem} ativo={aberto?.tipo === "item" ? aberto.itemId : null} />
      </OrigemDados>

      {consulta && <BannersConsulta pcaId={consulta.pcaId} abrir={aberto} onFechar={() => setAberto(null)} />}
    </>
  );
}
