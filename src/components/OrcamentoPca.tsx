"use client";

import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { brl, brlCompact, num } from "@/lib/format";
import {
  comparativoPorUnidade,
  type FaixaComprometimento,
  type LinhaComparativo,
  linhaAcima,
  origemDaLinha,
  SEM_VINCULO,
  type UnidadeRef,
  totaisComparativo,
} from "@/lib/orcamento-comparativo";
import type { LancamentoOrcamentoPca, PlanejadoOrcamentoPca } from "@/lib/pca-espaco";
import { FerramentasAba } from "./AbasEspaco";
import { BannersConsulta } from "./BannersConsulta";
import type { AberturaMesa } from "./BannersMesa";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { IconDownload, IconInfo } from "./icons";
import { ItemTable } from "./ItemTable";
import { OrcamentoComparativo } from "./OrcamentoComparativo";
import { OrigemDados } from "./OrigemDados";
import { Segmented } from "./Segmented";
import { StatMini } from "./StatMini";

type Filtro = "todas" | "acima" | "dentro";
type Vista = "comparativo" | "unidade";

/** Os dados do Comparativo (tabela cruzada) do orçamento do ano — os MESMOS da tela do orçamento. */
export type ComparativoPca = Omit<ComponentProps<typeof OrcamentoComparativo>, "inicio">;

const COR_FAIXA: Record<FaixaComprometimento, string> = {
  ok: "var(--ok)",
  atencao: "var(--warn)",
  acima: "var(--danger)",
  "sem-orcamento": "var(--danger)",
};

export type DadosOrcamentoPca = {
  /** O PCA (fonte protocolo: o item da origem abre o banner da consulta). */
  pcaId: number;
  ano: number | null;
  orcamento: { id: number; nome: string; ano: number } | null;
  visaoNome: string | null;
  bruto: number;
  filtrado: number;
  linhas: LancamentoOrcamentoPca[];
  planejado: PlanejadoOrcamentoPca[];
  unidades: UnidadeRef[];
};

type Planilha = NonNullable<PlanejadoOrcamentoPca["planilha"]> & { itens: number; valor: number };

const COLS_LANCAMENTO: Column<LancamentoOrcamentoPca>[] = [
  { key: "orgao", header: "Órgão", align: "left", minWidth: 180, value: (l) => l.orgao ?? "—", render: (l) => <span className="line-clamp-2">{l.orgao ?? "—"}</span> },
  { key: "unidade", header: "Unidade no CUBO", align: "left", minWidth: 180, value: (l) => l.unidade ?? "—", render: (l) => <span className="line-clamp-2">{l.unidade ?? "—"}</span> },
  { key: "elemento", header: "Elemento", align: "left", minWidth: 200, value: (l) => l.nomeElemento ?? "—", render: (l) => <span className="line-clamp-2">{l.nomeElemento ?? "—"}</span> },
  { key: "codigo", header: "Código", nowrap: true, value: (l) => l.codigoElemento ?? "—", render: (l) => <span className="font-mono text-[12px]">{l.codigoElemento ?? "—"}</span> },
  { key: "valor", header: "Dotação", align: "right", nowrap: true, filter: "range", numero: (l) => l.valor, render: (l) => <span className="font-semibold tabular-nums">{brl(l.valor)}</span> },
];

const COLS_PLANILHA: Column<Planilha>[] = [
  { key: "codigo", header: "Código", nowrap: true, value: (p) => p.codigo, render: (p) => <span className="font-mono text-[12px] font-semibold">{p.codigo}</span> },
  { key: "nome", header: "Planilha", align: "left", minWidth: 200, value: (p) => p.nome ?? "—", render: (p) => <span className="line-clamp-2">{p.nome ?? "—"}</span> },
  { key: "itens", header: "Itens", nowrap: true, filter: "range", numero: (p) => p.itens, render: (p) => num(p.itens) },
  { key: "valor", header: "Valor", align: "right", nowrap: true, filter: "range", numero: (p) => p.valor, render: (p) => <span className="font-semibold tabular-nums">{brl(p.valor)}</span> },
];

type AbaOrigem = "orcamento" | "pca";

/** ORIGEM de uma linha do comparativo: os lançamentos do CUBO e as contratações do PCA que formam os números. */
function OrigemLinha({ dados, aberta, onClose }: { dados: DadosOrcamentoPca; aberta: LinhaComparativo | null; onClose: () => void }) {
  const [aba, setAba] = useState<AbaOrigem>("orcamento");
  const [item, setItem] = useState<AberturaMesa | null>(null);
  // Mantém a última linha enquanto o banner fecha (animação) e volta à aba Orçamento a cada linha nova.
  const [linha, setLinha] = useState<LinhaComparativo | null>(aberta);
  useEffect(() => {
    if (!aberta) return;
    setLinha(aberta);
    setAba("orcamento");
  }, [aberta]);
  const origem = useMemo(
    () => (linha ? origemDaLinha(linha.unidadeId, dados.planejado, dados.linhas, dados.unidades) : { planejado: [], orcamento: [] }),
    [linha, dados],
  );
  const itens = origem.planejado.flatMap((p) => (p.item ? [p.item] : []));
  const planilhas: Planilha[] = origem.planejado.flatMap((p) => (p.planilha ? [{ ...p.planilha, itens: p.itens, valor: p.valor }] : []));
  const sem = linha?.unidadeId == null;
  return (
    <>
      <OrigemDados
        aberto={aberta != null}
        onClose={onClose}
        titulo="Comparativo Orçamento × Contratações"
        recorte={linha ? `${linha.sigla} — ${linha.nome}` : ""}
        resumo={[
          { label: "Orçamento para o PCA", value: brl(linha?.orcamento ?? 0), hint: `${num(origem.orcamento.length)} lançamento(s)` },
          { label: "Contratações do PCA", value: brl(linha?.planejado ?? 0), hint: `${num(linha?.contratacoes ?? 0)} item(ns)` },
          { label: "Diferença", value: brl(linha?.diferenca ?? 0) },
          { label: "Porcentagem", value: linha?.percentual == null ? "—" : `${(linha.percentual * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` },
        ]}
        fonte={
          <>
            <b>Orçamento:</b>{" "}
            {dados.orcamento ? `${dados.orcamento.nome} (${dados.orcamento.ano})` : `nenhum CUBO de ${dados.ano} importado`}
            {dados.visaoNome ? `, filtrado pela visão "${dados.visaoNome}"` : ", sem visão (orçamento inteiro)"} — os lançamentos chegam à
            unidade pelos Vínculos (Orçamento → Vínculos). <b>Contratações:</b>{" "}
            {dados.planejado.some((p) => p.planilha) ? "as planilhas importadas neste PCA." : "os itens ATIVOS dos DFDs incorporados a este PCA."}
          </>
        }
        avisos={
          sem
            ? [
                `"${SEM_VINCULO}" reúne os lançamentos cuja unidade do CUBO não está vinculada a uma unidade do sistema e as contratações sem unidade — vincule em Orçamento → Vínculos.`,
              ]
            : undefined
        }
      >
        <Segmented<AbaOrigem>
          value={aba}
          onChange={setAba}
          ariaLabel="Origem"
          options={[
            { value: "orcamento", label: `Orçamento (${num(origem.orcamento.length)})` },
            { value: "pca", label: `Contratações do PCA (${num(planilhas.length || itens.length)})` },
          ]}
        />
        <div key={aba} className="animate-cat-morph">
          {aba === "orcamento" ? (
            <DataTable
              columns={COLS_LANCAMENTO}
              rows={origem.orcamento}
              getKey={(l) => l.id}
              pageSize={20}
              density="compact"
              minWidth={860}
              resumo={(ls) => `${num(ls.length)} lançamento(s) · ${brl(ls.reduce((s, l) => s + l.valor, 0))}`}
            />
          ) : planilhas.length ? (
            <DataTable
              columns={COLS_PLANILHA}
              rows={planilhas}
              getKey={(p) => p.id}
              pageSize={20}
              minWidth={560}
              resumo={(ps) => `${num(ps.length)} planilha(s) · ${brl(ps.reduce((s, p) => s + p.valor, 0))}`}
            />
          ) : (
            <ItemTable
              rows={itens}
              showUnidade={sem}
              origem
              onRowClick={(r) => r.dfdId != null && setItem({ tipo: "item", dfdId: r.dfdId, itemId: r.id, item: { item: r.itemNumero ?? null, codigo: r.idProduto } })}
              ativo={item?.tipo === "item" ? item.itemId : null}
            />
          )}
        </div>
      </OrigemDados>
      <BannersConsulta pcaId={dados.pcaId} abrir={item} onFechar={() => setItem(null)} />
    </>
  );
}

/** Barra de porcentagem do comparativo (verde < 90% · âmbar 90–100% · vermelho > 100%). */
function BarraPct({ l }: { l: LinhaComparativo }) {
  if (l.percentual == null) return <span className="text-xs text-muted">{l.planejado > 0 ? "sem orçamento" : "—"}</span>;
  const w = Math.min(100, l.percentual * 100);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
        <span className="block h-full rounded-full" style={{ width: `${w}%`, background: COR_FAIXA[l.faixa] }} />
      </span>
      <span className="tabular-nums">{(l.percentual * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</span>
    </span>
  );
}

/**
 * Aba ORÇAMENTO do PCA — enxuta: os KPIs (a dotação do CUBO do MESMO ano, filtrada pela visão da Configuração, × o
 * planejado no PCA — os itens incorporados ativos) e, abaixo, o COMPARATIVO em duas vistas: o **PCA × Orçamento** por
 * unidade (a primeira, aberta) e a tabela cruzada da tela do orçamento (`OrcamentoComparativo`, abrindo na visão do PCA) (os lançamentos chegam à
 * unidade pelos Vínculos do Orçamento; o que não tem vínculo vira "Sem vínculo"). Sem orçamento do ano, só o por unidade.
 */
export function OrcamentoPca({ dados, comparativo = null }: { dados: DadosOrcamentoPca; comparativo?: ComparativoPca | null }) {
  const [vista, setVista] = useState<Vista>("unidade");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [aberta, setAberta] = useState<LinhaComparativo | null>(null);
  const linhas = useMemo(() => comparativoPorUnidade(dados.planejado, dados.linhas, dados.unidades), [dados]);
  const t = totaisComparativo(linhas);
  const acima = linhas.filter(linhaAcima);
  const vis = filtro === "todas" ? linhas : filtro === "acima" ? acima : linhas.filter((l) => !linhaAcima(l));

  async function exportar() {
    const XLSX = await import("xlsx");
    const aoa: (string | number)[][] = [
      ["Unidade", "Nome", "Contratações", "Contratações do PCA", "Orçamento para o PCA", "Diferença", "Porcentagem"],
      ...vis.map((l) => [l.sigla, l.nome, l.contratacoes, l.planejado, l.orcamento, l.diferenca, l.percentual == null ? "" : l.percentual]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Comparativo");
    XLSX.writeFile(wb, `comparativo-orcamento-pca-${dados.ano ?? ""}.xlsx`);
  }

  const cols: Column<LinhaComparativo>[] = [
    { key: "unidade", header: "Unidade", align: "left", nowrap: true, value: (l) => l.sigla, render: (l) => <span className="font-semibold text-text" title={l.nome}>{l.sigla}</span> },
    { key: "contratacoes", header: "Contratações", nowrap: true, filter: "range", numero: (l) => l.contratacoes, formatarFaixa: num, render: (l) => num(l.contratacoes) },
    { key: "planejado", header: "Contratações do PCA", align: "right", nowrap: true, filter: "range", numero: (l) => l.planejado, render: (l) => <span className="text-accent">{brl(l.planejado)}</span> },
    { key: "orcamento", header: "Orçamento para o PCA", align: "right", nowrap: true, filter: "range", numero: (l) => l.orcamento, render: (l) => brl(l.orcamento) },
    {
      key: "diferenca",
      header: "Diferença",
      align: "right",
      nowrap: true,
      filter: "range",
      numero: (l) => l.diferenca,
      render: (l) => <span className="font-semibold" style={{ color: l.diferenca < 0 ? "var(--danger)" : "var(--ok)" }}>{brl(l.diferenca)}</span>,
    },
    { key: "pct", header: "Porcentagem", nowrap: true, filter: "range", numero: (l) => l.percentual, render: (l) => <BarraPct l={l} /> },
  ];

  if (dados.ano == null) return <Callout kind="warn">Defina o ano do PCA (aba Configuração) para cruzar com o orçamento.</Callout>;

  // A troca de vista fica no INÍCIO da linha de controles de cada vista (sem linha a mais).
  const trocaVista = comparativo && (
    <Segmented<Vista>
      value={vista}
      onChange={setVista}
      ariaLabel="Vista do comparativo"
      options={[
        { value: "unidade", label: "PCA × Orçamento", curto: "PCA × Orç." },
        { value: "comparativo", label: "Comparativo" },
      ]}
    />
  );
  const comprometido = t.comprometido;

  return (
    <div className="space-y-[var(--gap-block)]">
      {!dados.orcamento && (
        <Callout kind="warn" icon={<IconInfo className="h-4 w-4" />}>
          Nenhum orçamento de {dados.ano} importado — importe o CUBO em Orçamento para comparar.
        </Callout>
      )}
      <div className="grid grid-cols-2 gap-[var(--gap-block)] lg:grid-cols-4">
        <StatMini
          label={`Dotação ${dados.ano}${dados.visaoNome ? ` · ${dados.visaoNome}` : ""}`}
          value={brlCompact(dados.filtrado)}
          hint={dados.visaoNome ? `bruta ${brlCompact(dados.bruto)}` : "orçamento inteiro"}
        />
        <StatMini label="Planejado no PCA" value={brlCompact(t.planejado)} tone="accent" hint="itens ativos" />
        <StatMini label="Saldo" value={brlCompact(t.saldo)} tone={t.saldo < 0 ? "danger" : "ok"} hint="dotação − planejado" />
        <StatMini
          label="Comprometido"
          value={comprometido == null ? "—" : `${Math.round(comprometido * 100)}%`}
          tone={comprometido == null ? "default" : comprometido > 1 ? "danger" : comprometido >= 0.9 ? "warn" : "ok"}
          hint="planejado ÷ dotação"
        />
      </div>

      {comparativo && vista === "comparativo" ? (
        <OrcamentoComparativo {...comparativo} inicio={trocaVista} />
      ) : (
        <>
          <FerramentasAba>
            <Button size="sm" variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={exportar} disabled={vis.length === 0}>
              XLSX
            </Button>
          </FerramentasAba>
          <div className="flex flex-wrap items-center gap-2">
            {trocaVista}
            <Segmented<Filtro>
              value={filtro}
              onChange={setFiltro}
              ariaLabel="Unidades"
              options={[
                { value: "todas", label: `Todas (${linhas.length})` },
                { value: "acima", label: `Acima (${acima.length})` },
                { value: "dentro", label: `Dentro (${linhas.length - acima.length})` },
              ]}
            />
          </div>
          <DataTable
            columns={cols}
            rows={vis}
            getKey={(l) => (l.unidadeId == null ? "sem" : l.unidadeId)}
            scrollInterno
            density="compact"
            minWidth={900}
            onRowClick={setAberta}
            activeKey={aberta ? (aberta.unidadeId == null ? "sem" : aberta.unidadeId) : null}
            vazio="Nada a comparar nesta visão."
            resumo={(ls) =>
              `${ls.length} unidade(s) · PCA ${brl(ls.reduce((s, l) => s + l.planejado, 0))} · orçamento ${brl(ls.reduce((s, l) => s + l.orcamento, 0))}`
            }
          />
        </>
      )}
      <OrigemLinha dados={dados} aberta={aberta} onClose={() => setAberta(null)} />
    </div>
  );
}
