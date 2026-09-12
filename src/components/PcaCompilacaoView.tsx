"use client";

import type { PcaDetalhe } from "@/lib/dfd";
import { brl, dataBR, num } from "@/lib/format";
import { type Column, DataTable } from "./DataTable";
import { KpiStat } from "./KpiStat";

type LinhaComp = {
  id: number;
  dfdNumero: string;
  item: number | null;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
  quantidade: number | null;
};

const COLS: Column<LinhaComp>[] = [
  { key: "dfd", header: "DFD", render: (r) => <span className="font-mono text-[12px] text-accent">{r.dfdNumero}</span> },
  { key: "item", header: "Item", align: "right", render: (r) => r.item ?? "—" },
  {
    key: "codigo",
    header: "Código",
    render: (r) => <span className="font-mono text-[12px]">{r.codigo ?? "—"}</span>,
  },
  {
    key: "descricao",
    header: "Descrição",
    minWidth: 300,
    render: (r) => <span className="line-clamp-2">{r.descricao ?? "—"}</span>,
  },
  { key: "unidade", header: "Unidade", render: (r) => r.unidade ?? "—" },
  {
    key: "quantidade",
    header: "Qtd.",
    align: "right",
    render: (r) => (r.quantidade != null ? num(r.quantidade) : "—"),
  },
];

export function PcaCompilacaoView({ pca }: { pca: PcaDetalhe }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-text">{pca.nome}</h2>
        <p className="mt-0.5 text-sm text-muted">
          {[pca.ano ? `Ano ${pca.ano}` : null, pca.criadoEm ? `gerado em ${dataBR(pca.criadoEm)}` : null]
            .filter(Boolean)
            .join(" · ") || "Compilação de DFDs"}
        </p>
        {pca.observacao && <p className="mt-1 text-sm text-text-2">{pca.observacao}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiStat label="DFDs compilados" value={num(pca.totalDfds ?? 0)} hint="na geração desta edição" />
        <KpiStat label="Itens" value={num(pca.totalItens ?? 0)} cor="var(--info)" />
        <KpiStat
          label="Valor estimado total"
          value={brl(pca.valorEstimado ?? 0)}
          cor="var(--ok)"
          hint="soma dos DFDs"
        />
      </div>

      {pca.grupos.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
          Esta edição não tem DFDs.
        </p>
      ) : (
        pca.grupos.map((g) => {
          const linhas: LinhaComp[] = g.dfds.flatMap((d) =>
            d.itens.map((it) => ({
              id: it.id,
              dfdNumero: d.numero,
              item: it.item,
              codigo: it.codigo,
              descricao: it.descricao,
              unidade: it.unidade,
              quantidade: it.quantidade,
            })),
          );
          const subtotal = g.dfds.reduce((s, d) => s + (d.valorEstimado ?? 0), 0);
          const titulo =
            g.reparticaoCodigo || g.reparticaoNome
              ? `${g.reparticaoCodigo ?? ""}${g.reparticaoNome ? ` · ${g.reparticaoNome}` : ""}`
              : "Sem repartição";
          return (
            <section key={g.reparticaoId ?? "sem"} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold text-text">{titulo}</h3>
                <span className="text-[12.5px] text-muted">
                  {num(g.dfds.length)} DFD{g.dfds.length === 1 ? "" : "s"} · {brl(subtotal)}
                </span>
              </div>
              <DataTable
                columns={COLS}
                rows={linhas}
                getKey={(r) => r.id}
                minWidth={760}
                footer={`${linhas.length} ${linhas.length === 1 ? "item" : "itens"}`}
              />
            </section>
          );
        })
      )}
    </div>
  );
}
