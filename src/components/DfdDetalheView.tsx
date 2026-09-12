"use client";

import type { DfdDetalhe, DfdItemRow } from "@/lib/dfd";
import { brl, num } from "@/lib/format";
import { type Column, DataTable } from "./DataTable";

const COLS: Column<DfdItemRow>[] = [
  { key: "item", header: "Item", align: "right", render: (r) => r.item ?? "—" },
  {
    key: "codigo",
    header: "Código",
    render: (r) => <span className="font-mono text-[12px]">{r.codigo ?? "—"}</span>,
  },
  {
    key: "descricao",
    header: "Descrição",
    minWidth: 320,
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

export function DfdDetalheView({ dfd }: { dfd: DfdDetalhe }) {
  const rep =
    dfd.reparticaoCodigo || dfd.reparticaoNome
      ? `${dfd.reparticaoCodigo ?? ""}${dfd.reparticaoNome ? ` · ${dfd.reparticaoNome}` : ""}`
      : "Sem repartição";
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-text">DFD {dfd.numero}</h2>
        <p className="mt-0.5 text-sm text-muted">
          {[dfd.tipo, dfd.objeto].filter(Boolean).join(" · ") || "Documento de Formalização da Demanda"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-card border border-border bg-surface p-5 shadow-ring sm:grid-cols-3">
        <Campo label="Planejamento" valor={dfd.planejamento ?? "—"} />
        <Campo label="Repartição" valor={rep} />
        <Campo label="Responsável" valor={dfd.responsavel ?? "—"} />
        <Campo label="Órgão/Entidade" valor={dfd.orgaoEntidade ?? "—"} span />
        <Campo label="Setor Requisitante" valor={dfd.setorRequisitante ?? "—"} />
        <Campo label="Valor estimado" valor={dfd.valorEstimado != null ? brl(dfd.valorEstimado) : "—"} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-text-2">
          Itens ({num(dfd.totalItens ?? dfd.itens.length)})
        </h3>
        <DataTable
          columns={COLS}
          rows={dfd.itens}
          getKey={(r) => r.id}
          minWidth={680}
          footer={`${dfd.itens.length} ${dfd.itens.length === 1 ? "item" : "itens"}`}
        />
      </div>
    </div>
  );
}

function Campo({ label, valor, span }: { label: string; valor: string; span?: boolean }) {
  return (
    <div className={span ? "col-span-2 sm:col-span-1" : ""}>
      <div className="text-xs text-muted">{label}</div>
      <div className="font-semibold text-text" title={valor}>
        {valor}
      </div>
    </div>
  );
}
