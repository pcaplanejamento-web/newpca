"use client";

import { useMemo, useState } from "react";
import type { ItemRow } from "@/lib/queries";
import { brl, dataBR, dec } from "@/lib/format";
import { type Column, DataTable } from "./DataTable";
import { SearchField } from "./Field";

// Tabela de itens do dashboard (público). Recebe TODAS as linhas do servidor e
// filtra/ordena/pagina no cliente via DataTable (componente do design system).
// Busca livre por produto acima; demais colunas filtram pelo cabeçalho.
export function ItemTable({ rows, showUnidade }: { rows: ItemRow[]; showUnidade: boolean }) {
  const [q, setQ] = useState("");

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => (r.nomeProduto ?? "").toLowerCase().includes(t));
  }, [rows, q]);

  const colunas = useMemo<Column<ItemRow>[]>(() => {
    const cols: Column<ItemRow>[] = [
      {
        key: "seq",
        header: "Seq.",
        minWidth: 70,
        filter: "none",
        value: (r) => String(r.sequencial ?? ""),
        render: (r) => <span className="tabular-nums text-faint">{r.sequencial ?? "—"}</span>,
      },
      {
        key: "nome",
        header: "Produto",
        minWidth: 240,
        filter: "none",
        value: (r) => r.nomeProduto ?? "",
        render: (r) => (
          <span className="block max-w-[320px] truncate font-medium text-text" title={r.nomeProduto ?? ""}>
            {r.nomeProduto ?? "—"}
          </span>
        ),
      },
      {
        key: "classificacao",
        header: "Classificação",
        minWidth: 160,
        value: (r) => r.classificacao ?? "",
        render: (r) => (
          <span className="inline-block max-w-[180px] truncate rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-text-2" title={r.classificacao ?? ""}>
            {r.classificacao ?? "—"}
          </span>
        ),
      },
    ];
    if (showUnidade) {
      cols.push({
        key: "codigo",
        header: "Unid.",
        minWidth: 90,
        value: (r) => r.codigo ?? "",
        render: (r) => <span className="tabular-nums text-muted">{r.codigo ?? "—"}</span>,
      });
    }
    cols.push(
      {
        key: "medida",
        header: "Medida",
        minWidth: 100,
        value: (r) => r.unidadeMedida ?? "",
        render: (r) => <span className="text-muted">{r.unidadeMedida ?? "—"}</span>,
      },
      {
        key: "qtd",
        header: "Qtd.",
        align: "right",
        minWidth: 90,
        filter: "none",
        value: (r) => String(r.quantidade ?? ""),
        render: (r) => (
          <span className="tabular-nums text-text-2">{r.quantidade != null ? dec(r.quantidade) : "—"}</span>
        ),
      },
      {
        key: "vlrRef",
        header: "Vlr. Ref.",
        align: "right",
        minWidth: 110,
        filter: "none",
        value: (r) => String(r.valorReferencia ?? ""),
        render: (r) => (
          <span className="tabular-nums text-text-2">{r.valorReferencia != null ? brl(r.valorReferencia) : "—"}</span>
        ),
      },
      {
        key: "vlrTotal",
        header: "Vlr. Total",
        align: "right",
        minWidth: 120,
        filter: "none",
        value: (r) => String(r.valorTotal ?? ""),
        render: (r) => (
          <span className="font-semibold tabular-nums text-text">{r.valorTotal != null ? brl(r.valorTotal) : "—"}</span>
        ),
      },
      {
        key: "data",
        header: "Data",
        minWidth: 110,
        filter: "date",
        value: (r) => r.dataDesejada ?? "",
        render: (r) => <span className="tabular-nums text-muted">{dataBR(r.dataDesejada)}</span>,
      },
    );
    return cols;
  }, [showUnidade]);

  return (
    <div>
      <div className="mb-4 max-w-sm">
        <SearchField value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} placeholder="Buscar produto..." />
      </div>
      <DataTable
        columns={colunas}
        rows={filtradas}
        getKey={(r) => r.id}
        pageSize={25}
        minWidth={showUnidade ? 900 : 820}
        footer={`${filtradas.length} item${filtradas.length === 1 ? "" : "s"}`}
      />
    </div>
  );
}
