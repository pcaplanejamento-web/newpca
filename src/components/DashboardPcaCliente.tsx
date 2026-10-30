"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { blocosRelatorioDashboard } from "@/lib/dashboard-relatorio";
import { itensDoTexto } from "@/lib/itens-dash-texto";
import { brl, brlCompact, dataIsoBrasilia, mesLabel, num } from "@/lib/format";
import {
  agregarItensDash,
  alternarFiltro,
  chavesDoFiltro,
  cronogramaDash,
  definicaoDash,
  type DimTopo,
  fatiasDash,
  type ModoCronograma,
  type DimDash,
  type FiltrosDash,
  filtrarItensDash,
  mesesDoRecorte,
  opcoesDash,
  PREVISOES_DASH,
  PREVISOES_GENERICAS,
  periodicosDash,
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
import { Ajuda } from "./Ajuda";
import { ChartCard } from "./ChartCard";
import { ClassificacaoChart } from "./charts/ClassificacaoChart";
import { MensalChart } from "./charts/MensalChart";
import { DefinicaoPrevisaoChart, PeriodicidadeChart } from "./charts/PrevisaoChart";
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
import { GRADE_KPI } from "./EsqueletoTela";

/** Consulta do PCA de fonte protocolo (Protocolos · DFDs · Itens + banners discretos); `foraDaSoma` = os DFDs que a
 * consolidação deixou fora (só no painel; ausente na tela pública). */
export type ConsultaDashboard = { pcaId: number; protocolos: ProtocoloDoPca[]; dfds: DfdDoPca[]; foraDaSoma?: DfdForaDaSoma[] };

/** Os gráficos (as dimensões + o quadro das periodicidades, que filtra a dimensão `previsao`). */
type Grafico = DimDash | "periodo";

const TITULO: Record<Grafico, string> = {
  classificacao: "Classificação dos Itens",
  mes: "Cronograma Mensal",
  previsao: "Definição da Previsão",
  periodo: "Contratações Periódicas",
  item: "Top 100 Itens por Valor",
  unidadeMedida: "Medida",
  prioridade: "Prioridade dos DFDs",
  unidade: "Valor por Unidade",
  dominio: "Domínio dos Itens",
};

/** O ranking do gráfico de itens (o explorador também — o resto fica na Consulta de itens). */
const TOP_ITENS = 100;

/** O texto de uma opção dos menus do topo. */
function rotuloOpcao(dim: DimTopo, chave: string): string {
  if (dim === "mes") {
    const [a, m] = chave.split("-").map(Number);
    return mesLabel(m, a);
  }
  if (dim === "previsao") return chave;
  if (dim === "prioridade") return rotuloPrioridade(chave);
  if (chave !== "—") return chave;
  return dim === "classificacao" ? "Sem classificação" : dim === "dominio" ? "Sem domínio" : "Sem unidade";
}

/** O nome curto de cada filtro no chip. */
const TITULO_CHIP: Record<DimDash, string> = {
  classificacao: "Classificação",
  mes: "Mês",
  previsao: "Previsão",
  item: "Item",
  unidadeMedida: "Medida",
  prioridade: "Prioridade",
  unidade: "Unidade",
  dominio: "Domínio",
};

/** A ordem dos menus do topo e o nome de cada um. */
const DIMS_TOPO: { dim: DimTopo; rotulo: string }[] = [
  { dim: "classificacao", rotulo: "Classificação" },
  { dim: "mes", rotulo: "Mês" },
  { dim: "previsao", rotulo: "Previsão" },
  { dim: "prioridade", rotulo: "Prioridade" },
  { dim: "unidade", rotulo: "Unidade" },
  { dim: "dominio", rotulo: "Domínio" },
  { dim: "unidadeMedida", rotulo: "Medida" },
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
  nomesUnidades,
  nome,
  vista,
  semFiltroUnidade = false,
}: {
  resumo: Resumo;
  porClassificacao: Fatia[];
  porMes: PontoMensal[];
  porUnidadeMedida: Fatia[];
  /** TODOS os itens do PCA no texto compacto (`itensParaTexto`) — lido UMA vez aqui (milhares de linhas sem serializar valor a valor). */
  itensTexto: string;
  showUnidade: boolean;
  hintItens?: string;
  unidadeFiltrada?: boolean;
  consulta?: ConsultaDashboard;
  /** PRÉVIA ligada: a lista inclui os DFDs ainda não incorporados (a fonte da origem diz). */
  previa?: boolean;
  /** O NOME de cada unidade pela sigla (o filtro Unidade mostra e busca pelos dois). */
  nomesUnidades?: Record<string, string>;
  /** O nome do PCA (o título do relatório em PDF). */
  nome?: string;
  /** Vista FIXA escolhida fora (o menu da tela pública): sem o seletor Gráficos | Consulta — só monta a escolhida. */
  vista?: "graficos" | "consulta";
  /** A unidade já é filtrada no cabeçalho (tela pública): o filtro Unidade sai do topo (o gráfico fica). */
  semFiltroUnidade?: boolean;
}) {
  const itens = useMemo(() => itensDoTexto(itensTexto), [itensTexto]);
  const [filtros, setFiltros] = useState<FiltrosDash>({});
  const [origemAberta, setOrigemAberta] = useState(false);
  const [explorar, setExplorar] = useState<Grafico | null>(null);
  const [aberto, setAberto] = useState<AberturaMesa | null>(null);
  const [modoCrono, setModoCrono] = useState<ModoCronograma>("mensal");
  const [gerando, setGerando] = useState(false);
  const [abaLocal, setAba] = useState<"graficos" | "consulta">("graficos");
  const aba = vista ?? abaLocal;
  const podeExportar = usePodeExportar();
  const quem = useQuemExporta();
  const ativo = temFiltro(filtros);
  const rotuloUnidade = consulta ? "Unidade" : "Planilha";

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

  // Os detalhes das KPIs (sobre os itens à vista — os filtros do Dashboard valem).
  const ext = useMemo(() => {
    const valores = filtrados.map((i) => i.valorTotal ?? 0).filter((v) => v > 0).sort((a, b) => a - b);
    const meio = valores.length >> 1;
    const mediana = !valores.length ? 0 : valores.length % 2 ? valores[meio] : (valores[meio - 1] + valores[meio]) / 2;
    const media = valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : 0;
    const dfds = new Set<number>();
    const protocolos = new Set<string>();
    const classes = new Set<string>();
    for (const i of filtrados) {
      if (i.dfdId != null) dfds.add(i.dfdId);
      if (i.protocoloNumero) protocolos.add(i.protocoloNumero);
      if (i.classificacao) classes.add(i.classificacao);
    }
    return {
      comValor: valores.length,
      mediana,
      menor: valores[0] ?? 0,
      acimaMedia: valores.filter((v) => v > media).length,
      dfds: dfds.size,
      protocolos: protocolos.size,
      classes: classes.size,
    };
  }, [filtrados]);
  const pctTexto = (parte: number, total: number) =>
    `${(total > 0 ? (parte / total) * 100 : 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

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
  const dominios = useMemo(() => fatiasDash(filtrarItensDash(itens, filtros, "dominio"), "dominio"), [itens, filtros]);
  const temDominio = useMemo(() => itens.some((i) => i.dominio), [itens]);
  const temUnidades = unidades.filter((f) => f.label !== "—").length > 1 || filtros.unidade != null;
  // A previsão (fonte protocolo): o mês definido × a definição genérica — cada quadro SEM o filtro da própria dimensão.
  const temPrevisao = useMemo(() => itens.some((i) => i.ano != null), [itens]);
  const temGenericos = useMemo(() => itens.some((i) => i.anual), [itens]);
  const basePrevisao = useMemo(() => filtrarItensDash(itens, filtros, "previsao"), [itens, filtros]);
  const definicao = useMemo(() => definicaoDash(basePrevisao), [basePrevisao]);
  const periodicos = useMemo(() => periodicosDash(basePrevisao), [basePrevisao]);
  const cronograma = useMemo(
    () => (modoCrono === "mensal" && !ativo ? porMes : cronogramaDash(ativo ? filtrarItensDash(itens, filtros, "mes") : itens, modoCrono)),
    [modoCrono, ativo, porMes, itens, filtros],
  );

  // A cor de cada classificação pela ordem SEM filtro — a mesma categoria guarda a cor.
  const indiceCor = useMemo(() => new Map(porClassificacao.map((f, i) => [f.label, i])), [porClassificacao]);
  const corDe = (label: string) => indiceCor.get(label) ?? -1;
  const corPrioridade = (chave: string) => PRIORIDADES_DASH.find((p) => p.chave === chave)?.cor ?? "var(--faint)";
  const corPeriodo = (chave: string) => PREVISOES_DASH.find((p) => p.chave === chave)?.cor ?? "var(--faint)";

  const filtrar = (r: RecorteDash, rotulo: string) => setFiltros((f) => alternarFiltro(f, r, rotulo));
  const labels = (dim: "classificacao" | "unidadeMedida" | "prioridade" | "unidade" | "previsao" | "dominio") => {
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
      DIMS_TOPO.filter((d) => (d.dim === "prioridade" ? temPrioridade : d.dim === "unidade" ? temUnidades && !semFiltroUnidade : d.dim === "previsao" ? temPrevisao : d.dim === "dominio" ? temDominio : true)).map((d) => ({
        dim: d.dim,
        rotulo: d.dim === "unidade" ? rotuloUnidade : d.rotulo,
        opcoes: opcoesDash(itens, filtros, d.dim).map((o) => ({ ...o, rotulo: rotuloOpcao(d.dim, o.chave), detalhe: d.dim === "unidade" ? nomesUnidades?.[o.chave] : undefined })),
        selecionados: chavesDoFiltro(filtros, d.dim),
      })),
    [itens, filtros, temPrioridade, temUnidades, semFiltroUnidade, temPrevisao, temDominio, rotuloUnidade, nomesUnidades],
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

  // A série do explorador do gráfico aberto (todas as categorias — as pequenas também).
  const serieExplorar = useMemo((): PontoSerie[] => {
    if (explorar === "classificacao") return classes.map((f) => ({ chave: f.label, rotulo: f.label, valor: f.total, count: f.count }));
    if (explorar === "mes") {
      // No acumulado, o ranking é o de cada mês (a soma corrida não se compara).
      const base = modoCrono === "acumulado" ? cronogramaDash(ativo ? filtrarItensDash(itens, filtros, "mes") : itens, "mensal") : cronograma;
      return base.map((p) => ({ chave: `${p.ano}-${p.mes}`, rotulo: mesLabel(p.mes, p.ano), valor: p.total, count: p.count }));
    }
    if (explorar === "previsao") return definicao.map((f) => ({ chave: f.label, rotulo: f.label, valor: f.total, count: f.count }));
    if (explorar === "periodo") return periodicos.map((f) => ({ chave: f.label, rotulo: f.label, valor: f.total, count: f.count }));
    if (explorar === "unidadeMedida") return unids.map((f) => ({ chave: f.label, rotulo: f.label, valor: f.count }));
    if (explorar === "prioridade") return prioridades.map((f) => ({ chave: f.label, rotulo: rotuloPrioridade(f.label), valor: f.total, count: f.count }));
    if (explorar === "unidade") return unidades.map((f) => ({ chave: f.label, rotulo: f.label === "—" ? "Sem unidade" : f.label, valor: f.total, count: f.count }));
    if (explorar === "dominio") return dominios.map((f) => ({ chave: f.label, rotulo: f.label === "—" ? "Sem domínio" : f.label, valor: f.total, count: f.count }));
    if (explorar === "item") return ordenados.map((i) => ({ chave: String(i.id), rotulo: i.nomeProduto ?? `Item ${i.id}`, valor: i.valorTotal ?? 0 }));
    return [];
  }, [explorar, classes, cronograma, modoCrono, definicao, periodicos, unids, prioridades, unidades, dominios, itens, filtros, ativo, ordenados]);

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
              { titulo: TITULO.mes, rotulo: "Mês", fatias: mensal.map((p) => ({ label: mesLabel(p.mes, p.ano), total: p.total, count: p.count })) },
              ...(temPrevisao ? [{ titulo: TITULO.previsao, rotulo: "Definição", fatias: definicao.filter((f) => f.count > 0) }] : []),
              ...(periodicos.length ? [{ titulo: TITULO.periodo, rotulo: "Periodicidade", fatias: periodicos }] : []),
              ...(temPrioridade ? [{ titulo: TITULO.prioridade, rotulo: "Prioridade", fatias: prioridades.map((f) => ({ ...f, label: rotuloPrioridade(f.label) })) }] : []),
              ...(temUnidades ? [{ titulo: `Valor por ${rotuloUnidade}`, rotulo: rotuloUnidade, fatias: unidades.map((f) => ({ ...f, label: f.label === "—" ? "Sem unidade" : f.label })) }] : []),
              ...(temDominio ? [{ titulo: TITULO.dominio, rotulo: "Domínio", fatias: dominios.map((f) => ({ ...f, label: f.label === "—" ? "Sem domínio" : f.label })) }] : []),
              { titulo: TITULO.unidadeMedida, rotulo: "Medida", fatias: unids },
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
    else if (explorar === "dominio") filtrar({ dim: "dominio", labels: [chave] }, chave === "—" ? "Sem domínio" : chave);
    else if (explorar === "unidade") filtrar({ dim: "unidade", labels: [chave] }, chave === "—" ? "Sem unidade" : chave);
    else if (explorar === "mes") {
      const [a, m] = chave.split("-").map(Number);
      filtrar({ dim: "mes", ano: a, mes: m }, mesLabel(m, a));
    } else if (explorar === "previsao") {
      const genericos = chave === "Genérico";
      filtrar({ dim: "previsao", labels: genericos ? [...PREVISOES_GENERICAS] : [chave] }, genericos ? "Genérico (anual, semestral…)" : chave);
    } else if (explorar === "periodo") filtrar({ dim: "previsao", labels: [chave] }, chave);
    else if (explorar === "item") {
      const it = itens.find((i) => String(i.id) === chave);
      filtrar({ dim: "item", id: Number(chave) }, it?.nomeProduto ?? `Item ${chave}`);
    }
  }
  const ativaExplorar =
    explorar === "classificacao" || explorar === "unidadeMedida" || explorar === "prioridade" || explorar === "unidade" || explorar === "dominio"
      ? (labels(explorar)?.length === 1 ? labels(explorar)?.[0] : null) ?? null
      : explorar === "periodo"
        ? (labels("previsao")?.length === 1 ? labels("previsao")?.[0] : null) ?? null
        : explorar === "previsao"
          ? (() => {
              const l = labels("previsao");
              if (!l?.length) return null;
              if (l.length === 1 && !PREVISOES_GENERICAS.includes(l[0])) return l[0];
              return l.length === PREVISOES_GENERICAS.length && PREVISOES_GENERICAS.every((g) => l.includes(g)) ? "Genérico" : null;
            })()
      : explorar === "mes"
        ? mesesAtivos.length === 1
          ? mesesAtivos[0]
          : null
        : explorar === "item"
          ? itemAtivo != null
            ? String(itemAtivo)
            : null
          : null;

  // A explicação da Consulta no (?) — a linha da consulta fica só com os controles.
  const ajudaConsulta = (
    <Ajuda titulo="Consulta de itens" rotulo="Sobre a consulta" botao="sm">
      <p>
        {consulta ? "Os protocolos, DFDs e itens do PCA" : "Os itens do PCA"}
        {ativo ? `, só o que está nos filtros do Dashboard (${num(filtrados.length)} itens)` : ""}.
      </p>
      <p>Busque pelo produto ou código (vários de uma vez com “:”), filtre e ordene pelo cabeçalho de cada coluna.</p>
      {consulta && <p>Toque numa linha para ver o detalhe.</p>}
    </Ajuda>
  );

  // A vista FIXA da consulta (menu da tela pública) é só a consulta: os indicadores e os filtros do topo repetiriam os
  // filtros da própria tabela.
  const soConsulta = vista === "consulta";
  return (
    <>
      {!soConsulta && (
      <>
      <div className={GRADE_KPI}>
        <KpiStat
          realce
          completo
          label="Total planejado"
          value={brl(kTotal)}
          hint={ativo ? "Nos filtros do Dashboard" : "Soma de todos os itens do PCA"}
          detalhes={[
            { rotulo: "Itens com valor", valor: `${num(ext.comValor)} de ${num(filtrados.length)}` },
            ...(ext.dfds ? [{ rotulo: "Média por DFD", valor: brl(resumoVisto.total / ext.dfds) }] : []),
            { rotulo: "Classificações", valor: num(ext.classes) },
          ]}
        />
        <KpiStat
          realce
          completo
          label="Itens planejados"
          value={num(Math.round(kCount))}
          cor="var(--sit-finalizado)"
          hint={ativo ? "Itens nos filtros do Dashboard" : (hintItens ?? (unidadeFiltrada ? "Itens da unidade" : "Itens de todas as unidades"))}
          detalhes={[
            ...(ext.protocolos ? [{ rotulo: "Protocolos", valor: num(ext.protocolos) }] : []),
            ...(ext.dfds ? [{ rotulo: "DFDs", valor: num(ext.dfds) }] : []),
            { rotulo: rotuloUnidade === "Planilha" ? "Planilhas" : "Unidades requisitantes", valor: num(resumoVisto.numUnidades) },
          ]}
        />
        <KpiStat
          realce
          completo
          label="Valor médio por item"
          value={brl(kTicket)}
          cor="var(--sit-em-analise)"
          hint="Total planejado ÷ quantidade de itens"
          detalhes={[
            { rotulo: "Mediana", valor: brl(ext.mediana) },
            { rotulo: "Menor valor", valor: brl(ext.menor) },
            { rotulo: "Itens acima da média", valor: num(ext.acimaMedia) },
          ]}
        />
        <KpiStat
          realce
          completo
          label="Maior item"
          value={brl(kMaior)}
          cor="var(--sit-devolvido)"
          hint={resumoVisto.maiorNome ?? "—"}
          detalhes={
            maior
              ? [
                  { rotulo: "Participação no total", valor: pctTexto(resumoVisto.maiorValor, resumoVisto.total) },
                  ...(maior.quantidade != null ? [{ rotulo: "Quantidade", valor: `${num(maior.quantidade)} ${maior.unidadeMedida ?? ""}`.trim() }] : []),
                  ...(maior.dfdNumero ? [{ rotulo: "DFD", valor: maior.dfdNumero }] : maior.classificacao ? [{ rotulo: "Classificação", valor: maior.classificacao }] : []),
                ]
              : undefined
          }
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
        <FiltrosDashboard
          campos={campos}
          onMudar={mudarTopo}
          fim={
            <>
              <Ajuda titulo="Filtros do Dashboard" botao="sm">
                Escolha nos menus ou toque numa fatia/barra — os gráficos, os indicadores e a consulta seguem. Vários valores num
                filtro valem como "qualquer um"; filtros diferentes se somam.
              </Ajuda>
              {podeExportar && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={relatorio}
                  loading={gerando}
                  aria-label="Baixar o relatório em PDF"
                  title="Baixar o relatório (PDF): os indicadores e uma tabela por gráfico, com os filtros aplicados"
                  icon={<IconDownload className="h-4 w-4" />}
                />
              )}
            </>
          }
        />
        {ativo && (
        <div className="flex min-h-9 flex-wrap items-center gap-2" aria-live="polite">
          <IconFilter className="h-4 w-4 shrink-0 text-accent" aria-hidden />
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
          </span>
        </div>
        )}
      </section>
      </>
      )}

      {!vista && <Segmented
        value={aba}
        onChange={setAba}
        ariaLabel="Gráficos ou consulta de itens"
        options={[
          { value: "graficos", label: "Gráficos", dica: "Os gráficos do PCA — toque para filtrar, expanda para explorar" },
          { value: "consulta", label: `Consulta de itens (${num(filtrados.length)})`, curto: `Consulta (${num(filtrados.length)})`, dica: "Busque, filtre e ordene os itens (seguem os filtros acima)" },
        ]}
      />}

      <div key={aba} className="animate-cat-morph">
        {aba === "graficos" ? (
          <div className="grid grid-cols-1 gap-[var(--gap-block)] lg:grid-cols-2">
            {[
              <ChartCard key="classificacao" title={TITULO.classificacao} subtitle="Valor por categoria — toque para filtrar" onExpandir={() => setExplorar("classificacao")}>
                <ClassificacaoChart data={classes} onSelecionar={filtrar} ativos={labels("classificacao")} corDe={corDe} />
              </ChartCard>,
              <ChartCard
                key="mes"
                title={TITULO.mes}
                subtitle={temGenericos ? "Só os itens com o mês definido — toque para filtrar" : "Valor planejado por mês desejado — toque para filtrar"}
                onExpandir={() => setExplorar("mes")}
              >
                <MensalChart data={cronograma} onSelecionar={filtrar} ativos={mesesAtivos} modo={modoCrono} onModo={setModoCrono} temGenericos={temGenericos} />
              </ChartCard>,
              temPrevisao ? (
                <ChartCard key="previsao" title={TITULO.previsao} subtitle="Mês definido × definição genérica — toque para filtrar" onExpandir={() => setExplorar("previsao")}>
                  <DefinicaoPrevisaoChart data={definicao} onSelecionar={filtrar} ativos={labels("previsao")} />
                </ChartCard>
              ) : null,
              temGenericos ? (
                <ChartCard key="periodo" title={TITULO.periodo} subtitle="Anual, semestral, quadrimestral e trimestral — fora do cronograma mensal" onExpandir={() => setExplorar("periodo")}>
                  <PeriodicidadeChart data={periodicos} onSelecionar={filtrar} ativos={labels("previsao")} />
                </ChartCard>
              ) : null,
              <ChartCard key="item" title={TITULO.item} subtitle={`Os ${num(tops.length)} maiores itens — role a lista; toque para filtrar`} onExpandir={() => setExplorar("item")}>
                <TopItensChart data={tops} onSelecionar={filtrar} ativo={itemAtivo} alturaMax={420} />
              </ChartCard>,
              <ChartCard key="unidadeMedida" title={TITULO.unidadeMedida} subtitle="Itens por medida — toque para filtrar" onExpandir={() => setExplorar("unidadeMedida")}>
                <UnidadeChart data={unids} onSelecionar={filtrar} ativos={labels("unidadeMedida")} />
              </ChartCard>,
              temPrioridade ? (
                <ChartCard key="prioridade" title={TITULO.prioridade} subtitle="Valor dos itens pela prioridade do DFD — toque para filtrar" onExpandir={() => setExplorar("prioridade")}>
                  <PrioridadeChart data={prioridades} onSelecionar={filtrar} ativos={labels("prioridade")} />
                </ChartCard>
              ) : null,
              temDominio ? (
                <ChartCard key="dominio" title={TITULO.dominio} subtitle="Valor dos itens por domínio (material, serviço…) — toque para filtrar" onExpandir={() => setExplorar("dominio")}>
                  <UnidadeRequisitanteChart dim="dominio" semValor="Sem domínio" data={dominios} onSelecionar={filtrar} ativos={labels("dominio")} />
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
          <ChartCard>
            {consultaVista ? (
              <ConsultaPca
                protocolos={consultaVista.protocolos}
                dfds={consultaVista.dfds}
                foraDaSoma={consultaVista.foraDaSoma}
                itens={filtrados}
                showUnidade={showUnidade}
                aberto={aberto}
                onAbrir={setAberto}
                fim={ajudaConsulta}
                alturaCheia={vista === "consulta"}
              />
            ) : (
              <ItemTable rows={filtrados} showUnidade={showUnidade} fim={ajudaConsulta} alturaCheia={vista === "consulta"} />
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
        corDe={explorar === "classificacao" ? corDe : explorar === "prioridade" ? corPrioridade : explorar === "periodo" ? corPeriodo : undefined}
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
      >
        <ItemTable rows={filtrados} showUnidade={showUnidade} origem={!!consulta} onRowClick={abrirItem} ativo={aberto?.tipo === "item" ? aberto.itemId : null} />
      </OrigemDados>

      {consulta && <BannersConsulta pcaId={consulta.pcaId} abrir={aberto} onFechar={() => setAberto(null)} />}
    </>
  );
}
