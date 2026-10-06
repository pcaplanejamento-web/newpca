"use client";

import { useMemo, useState } from "react";
import { brl, brlCompact, mesLabel, num } from "@/lib/format";
import {
  agregarItensDash,
  alternarFiltro,
  type DimDash,
  type FiltrosDash,
  filtrarItensDash,
  type RecorteDash,
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
import { TopItensChart } from "./charts/TopItensChart";
import { UnidadeChart } from "./charts/UnidadeChart";
import { ConsultaPca } from "./ConsultaPca";
import { ExploradorGrafico } from "./ExploradorGrafico";
import { IconFilter, IconClose } from "./icons";
import { ItemTable } from "./ItemTable";
import { KpiStat } from "./KpiStat";
import { OrigemDados } from "./OrigemDados";

/** Consulta do PCA de fonte protocolo (Protocolos · DFDs · Itens + banners discretos); `foraDaSoma` = os DFDs que a
 * consolidação deixou fora (só no painel; ausente na tela pública). */
export type ConsultaDashboard = { pcaId: number; protocolos: ProtocoloDoPca[]; dfds: DfdDoPca[]; foraDaSoma?: DfdForaDaSoma[] };

type Grafico = "classificacao" | "mes" | "item" | "unidadeMedida";

const TITULO: Record<Grafico, string> = {
  classificacao: "Classificação dos Itens",
  mes: "Cronograma Mensal",
  item: "Itens por Valor",
  unidadeMedida: "Unidades de Medida",
};

/** O ranking do explorador de itens: no máximo isto (o resto fica na Consulta). */
const MAX_ITENS_EXPLORADOR = 200;

/**
 * KPIs + GRÁFICOS + CONSULTA do Dashboard do PCA (painel e tela inicial) — UM cliente, p/ os itens trafegarem uma vez só.
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
  top,
  itensTexto,
  showUnidade,
  hintItens,
  unidadeFiltrada = false,
  consulta,
  previa = false,
}: {
  resumo: Resumo;
  porClassificacao: Fatia[];
  porMes: PontoMensal[];
  porUnidadeMedida: Fatia[];
  top: TopItem[];
  /** TODOS os itens do PCA num texto JSON (`ItemRow[]`) — lido UMA vez aqui (milhares de linhas sem serializar valor a valor). */
  itensTexto: string;
  showUnidade: boolean;
  hintItens?: string;
  unidadeFiltrada?: boolean;
  consulta?: ConsultaDashboard;
  /** PRÉVIA ligada: a lista inclui os DFDs ainda não incorporados (a fonte da origem diz). */
  previa?: boolean;
}) {
  const itens = useMemo(() => JSON.parse(itensTexto) as ItemRow[], [itensTexto]);
  const [filtros, setFiltros] = useState<FiltrosDash>({});
  const [origemAberta, setOrigemAberta] = useState(false);
  const [explorar, setExplorar] = useState<Grafico | null>(null);
  const [aberto, setAberto] = useState<AberturaMesa | null>(null);
  const ativo = temFiltro(filtros);

  // Cada gráfico SEM o filtro da própria dimensão; sem filtro nenhum, os números do servidor.
  const dados = useMemo(() => {
    const de = (dim: DimDash) => agregarItensDash(filtrarItensDash(itens, filtros, dim));
    if (!ativo) return null;
    return { classificacao: de("classificacao"), mes: de("mes"), item: de("item"), unidadeMedida: de("unidadeMedida") };
  }, [itens, filtros, ativo]);
  const filtrados = useMemo(() => (ativo ? filtrarItensDash(itens, filtros) : itens), [itens, filtros, ativo]);
  const resumoVisto: Resumo = useMemo(() => (ativo ? agregarItensDash(filtrados).resumo : resumo), [ativo, filtrados, resumo]);
  const maior = useMemo(() => {
    let m: ItemRow | null = null;
    for (const i of filtrados) if (!m || (i.valorTotal ?? 0) > (m.valorTotal ?? 0)) m = i;
    return m;
  }, [filtrados]);

  const classes = dados?.classificacao.porClassificacao ?? porClassificacao;
  const meses = dados?.mes.porMes ?? porMes;
  const tops = dados?.item.top ?? top;
  const unids = dados?.unidadeMedida.porUnidadeMedida ?? porUnidadeMedida;

  // A cor de cada classificação pela ordem SEM filtro — a mesma categoria guarda a cor.
  const indiceCor = useMemo(() => new Map(porClassificacao.map((f, i) => [f.label, i])), [porClassificacao]);
  const corDe = (label: string) => indiceCor.get(label) ?? -1;

  const filtrar = (r: RecorteDash, rotulo: string) => setFiltros((f) => alternarFiltro(f, r, rotulo));
  const labels = (dim: "classificacao" | "unidadeMedida") => {
    const r = filtros[dim]?.recorte;
    return r && r.dim === dim ? r.labels : undefined;
  };
  const mesAtivo = (() => {
    const r = filtros.mes?.recorte;
    return r?.dim === "mes" ? `${r.ano}-${r.mes}` : null;
  })();
  const itemAtivo = (() => {
    const r = filtros.item?.recorte;
    return r?.dim === "item" ? r.id : null;
  })();

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
  const textoFiltros = chips.map(([dim, f]) => `${TITULO[dim]}: ${f.rotulo}`).join(" · ");
  const valorFiltrado = filtrados.reduce((s, i) => s + (i.valorTotal ?? 0), 0);
  const anuaisNoMes = filtros.mes ? filtrados.filter((i) => i.anual).length : 0;

  // A série do explorador do gráfico aberto (todas as categorias — as pequenas também).
  const serieExplorar = useMemo((): PontoSerie[] => {
    if (explorar === "classificacao") return classes.map((f) => ({ chave: f.label, rotulo: f.label, valor: f.total, count: f.count }));
    if (explorar === "mes") return meses.map((p) => ({ chave: `${p.ano}-${p.mes}`, rotulo: mesLabel(p.mes, p.ano), valor: p.total, count: p.count }));
    if (explorar === "unidadeMedida") return unids.map((f) => ({ chave: f.label, rotulo: f.label, valor: f.count }));
    if (explorar === "item") {
      const base = ativo ? filtrarItensDash(itens, filtros, "item") : itens;
      return base
        .filter((i) => (i.valorTotal ?? 0) > 0)
        .sort((a, b) => (b.valorTotal ?? 0) - (a.valorTotal ?? 0))
        .slice(0, MAX_ITENS_EXPLORADOR)
        .map((i) => ({ chave: String(i.id), rotulo: i.nomeProduto ?? `Item ${i.id}`, valor: i.valorTotal ?? 0 }));
    }
    return [];
  }, [explorar, classes, meses, unids, itens, filtros, ativo]);

  function filtrarDoExplorador(chave: string) {
    if (explorar === "classificacao") filtrar({ dim: "classificacao", labels: [chave] }, chave);
    else if (explorar === "unidadeMedida") filtrar({ dim: "unidadeMedida", labels: [chave] }, chave);
    else if (explorar === "mes") {
      const [a, m] = chave.split("-").map(Number);
      filtrar({ dim: "mes", ano: a, mes: m }, mesLabel(m, a));
    } else if (explorar === "item") {
      const it = itens.find((i) => String(i.id) === chave);
      filtrar({ dim: "item", id: Number(chave) }, it?.nomeProduto ?? `Item ${chave}`);
    }
  }
  const ativaExplorar =
    explorar === "classificacao" || explorar === "unidadeMedida"
      ? (labels(explorar)?.length === 1 ? labels(explorar)?.[0] : null) ?? null
      : explorar === "mes"
        ? mesAtivo
        : explorar === "item"
          ? itemAtivo != null
            ? String(itemAtivo)
            : null
          : null;

  return (
    <>
      <div className="grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-2 xl:grid-cols-4">
        <KpiStat label="Total Planejado" value={brlCompact(resumoVisto.total)} hint={`em ${num(resumoVisto.count)} itens`} />
        <KpiStat
          label="Qtd. de Itens"
          value={num(resumoVisto.count)}
          cor="var(--sit-finalizado)"
          hint={ativo ? "itens no filtro" : (hintItens ?? (unidadeFiltrada ? "itens na unidade" : `${num(resumoVisto.numUnidades)} unidade(s)`))}
        />
        <KpiStat label="Ticket Médio" value={brl(resumoVisto.ticket)} cor="var(--sit-em-analise)" hint="por item" />
        <KpiStat
          label="Maior Item"
          value={brlCompact(resumoVisto.maiorValor)}
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

      {ativo && (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-accent/30 bg-accent-soft/50 px-3 py-2" aria-live="polite">
          <IconFilter className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          {chips.map(([dim, f]) => (
            <span key={dim} className="inline-flex max-w-full items-center gap-1 rounded-chip border border-accent/30 bg-surface pl-2.5 text-xs text-text">
              <span className="text-muted">{TITULO[dim]}:</span>
              <span className="truncate font-medium">{f.rotulo}</span>
              <button
                type="button"
                aria-label={`Tirar o filtro ${TITULO[dim]}: ${f.rotulo}`}
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
            <Button size="sm" variant="secondary" onClick={() => setOrigemAberta(true)}>
              Ver origem ({num(filtrados.length)})
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFiltros({})}>
              Limpar
            </Button>
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-[var(--gap-block)] lg:grid-cols-2">
        <ChartCard title={TITULO.classificacao} subtitle="Valor por categoria — toque para filtrar" onExpandir={() => setExplorar("classificacao")}>
          <ClassificacaoChart data={classes} onSelecionar={filtrar} ativos={labels("classificacao")} corDe={corDe} />
        </ChartCard>
        <ChartCard title={TITULO.mes} subtitle="Valor planejado por mês desejado — toque para filtrar" onExpandir={() => setExplorar("mes")}>
          <MensalChart data={meses} onSelecionar={filtrar} ativo={mesAtivo} />
        </ChartCard>
        <ChartCard title="Top 10 Itens por Valor" subtitle="Maiores contratações planejadas — toque para filtrar" onExpandir={() => setExplorar("item")}>
          <TopItensChart data={tops} onSelecionar={filtrar} ativo={itemAtivo} />
        </ChartCard>
        <ChartCard title={TITULO.unidadeMedida} subtitle="Itens por unidade de medida — toque para filtrar" onExpandir={() => setExplorar("unidadeMedida")}>
          <UnidadeChart data={unids} onSelecionar={filtrar} ativos={labels("unidadeMedida")} />
        </ChartCard>
      </div>

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

      <ExploradorGrafico
        aberto={explorar != null}
        onClose={() => setExplorar(null)}
        titulo={explorar ? TITULO[explorar] : ""}
        serie={serieExplorar}
        medida={explorar === "unidadeMedida" ? "itens" : "valor"}
        formatar={explorar === "unidadeMedida" ? num : brl}
        corDe={explorar === "classificacao" ? corDe : undefined}
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
