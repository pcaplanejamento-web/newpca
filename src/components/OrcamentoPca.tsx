"use client";

import { useMemo, useState } from "react";
import { brl, brlCompact, num } from "@/lib/format";
import {
  comparativoPorUnidade,
  type FaixaComprometimento,
  type LinhaComparativo,
  linhaAcima,
  type UnidadeRef,
  totaisComparativo,
} from "@/lib/orcamento-comparativo";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { IconDownload, IconInfo, IconScale } from "./icons";
import { KpiStat } from "./KpiStat";
import { Segmented } from "./Segmented";

type Filtro = "todas" | "acima" | "dentro";

const COR_FAIXA: Record<FaixaComprometimento, string> = {
  ok: "var(--ok)",
  atencao: "var(--warn)",
  acima: "var(--danger)",
  "sem-orcamento": "var(--danger)",
};

export type DadosOrcamentoPca = {
  ano: number | null;
  orcamento: { id: number; nome: string; ano: number } | null;
  visaoNome: string | null;
  bruto: number;
  filtrado: number;
  linhas: { unidadeId: number | null; valor: number }[];
  planejado: { unidadeId: number | null; itens: number; valor: number }[];
  unidades: UnidadeRef[];
};

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
 * Aba ORÇAMENTO do PCA: a dotação do CUBO do MESMO ano (filtrada pela visão escolhida na
 * Configuração) × o planejado no PCA (os itens incorporados ativos), em KPIs e no COMPARATIVO por unidade. Os
 * lançamentos chegam à unidade pelos Vínculos do Orçamento; o que não tem vínculo vira "Sem vínculo".
 */
export function OrcamentoPca({ dados }: { dados: DadosOrcamentoPca }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
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
    { key: "contratacoes", header: "Contratações", nowrap: true, filter: "range", numero: (l) => l.contratacoes, render: (l) => num(l.contratacoes) },
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

  return (
    <div className="space-y-[var(--gap-col)]">
      {!dados.orcamento && (
        <Callout kind="warn" icon={<IconInfo className="h-4 w-4" />}>
          Nenhum orçamento de {dados.ano} importado — importe o CUBO em Orçamento para comparar.
        </Callout>
      )}
      <div className="grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-2 xl:grid-cols-4">
        <KpiStat
          label={`Dotação ${dados.ano} (filtrada)`}
          value={brlCompact(dados.filtrado)}
          hint={
            dados.visaoNome
              ? `bruta ${brlCompact(dados.bruto)} − ${brlCompact(dados.bruto - dados.filtrado)} pela visão "${dados.visaoNome}"`
              : "sem visão — orçamento inteiro"
          }
        />
        <KpiStat label="Planejado no PCA" value={brlCompact(t.planejado)} cor="var(--info)" hint="itens ativos" />
        <KpiStat label="Saldo" value={brlCompact(t.saldo)} cor={t.saldo < 0 ? "var(--danger)" : "var(--ok)"} hint="dotação − planejado" />
        <KpiStat
          label="Comprometido"
          value={t.comprometido == null ? "—" : `${Math.round(t.comprometido * 100)}%`}
          cor={t.comprometido == null ? "var(--muted)" : t.comprometido > 1 ? "var(--danger)" : t.comprometido >= 0.9 ? "var(--warn)" : "var(--ok)"}
          hint="planejado ÷ dotação"
        />
      </div>

      <section className="space-y-4 rounded-card border border-border bg-surface p-4 shadow-ring sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <IconScale className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-bold text-text">Comparativo Orçamento × Contratações</h2>
            <p className="text-sm text-muted">Por unidade · contratações do PCA vs. orçamento para o PCA (já filtrado pela visão)</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Filtro>
            value={filtro}
            onChange={setFiltro}
            options={[
              { value: "todas", label: `Todas (${linhas.length})` },
              { value: "acima", label: `Acima do orçamento (${acima.length})` },
              { value: "dentro", label: `Dentro (${linhas.length - acima.length})` },
            ]}
          />
          <Button variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={exportar} disabled={vis.length === 0}>
            Exportar .xlsx
          </Button>
        </div>
        {vis.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Nada a comparar nesta visão.</p>
        ) : (
          <DataTable
            columns={cols}
            rows={vis}
            getKey={(l) => (l.unidadeId == null ? "sem" : l.unidadeId)}
            pageSize={20}
            minWidth={900}
            resumo={(ls) =>
              `${ls.length} unidade(s) · PCA ${brl(ls.reduce((s, l) => s + l.planejado, 0))} · orçamento ${brl(ls.reduce((s, l) => s + l.orcamento, 0))}`
            }
          />
        )}
      </section>
    </div>
  );
}
