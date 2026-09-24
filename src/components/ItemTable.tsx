"use client";

import { useMemo, useState } from "react";
import { brl, dataBR, dec, num, numeroSemAno } from "@/lib/format";
import type { ItemRow } from "@/lib/queries";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { CelulaCopiavel } from "./BotaoCopiar";
import { type Column, DataTable } from "./DataTable";
import { SearchField } from "./Field";

/**
 * Tabela de ITENS do Dashboard do PCA (painel e tela inicial) — o MESMO `DataTable` das demais telas: TODAS as
 * colunas filtráveis/ordenáveis (facetas conectadas; faixa nas colunas numéricas/R$; período na data), sem quebra
 * nos dados curtos, linha compacta e busca por produto/código (vários de uma vez com ":"). Com `origem` (painel, PCA
 * de fonte protocolo) mostra o Protocolo/DFD de cada item e a linha abre o banner do item (`onRowClick`/`ativo`).
 * Só dados — nenhum estado/erro de protocolo, DFD ou item é apontado aqui.
 */
export function ItemTable({
  rows,
  showUnidade,
  origem = false,
  onRowClick,
  ativo = null,
}: {
  rows: ItemRow[];
  showUnidade: boolean;
  /** Colunas Protocolo · Nº DFD (itens vindos de DFDs). */
  origem?: boolean;
  onRowClick?: (r: ItemRow) => void;
  /** Item cujo banner está aberto (linha destacada). */
  ativo?: number | null;
}) {
  const [q, setQ] = useState("");

  const filtradas = useMemo(() => {
    const casa = predicadoBusca(q); // vários produtos de uma vez com ":"
    return casa ? rows.filter((r) => casa([r.nomeProduto, r.idProduto])) : rows;
  }, [rows, q]);

  const colunas = useMemo<Column<ItemRow>[]>(() => {
    const cols: Column<ItemRow>[] = [
      {
        key: "seq",
        header: "Seq.",
        nowrap: true,
        filter: "range",
        formatarFaixa: num,
        numero: (r) => r.sequencial,
        render: (r) => <span className="tabular-nums text-faint">{r.sequencial ?? "—"}</span>,
      },
    ];
    if (origem)
      cols.push(
        {
          key: "protocolo",
          header: "Protocolo",
          nowrap: true,
          value: (r) => r.protocoloNumero ?? "—",
          render: (r) =>
            r.protocoloNumero ? (
              <CelulaCopiavel copiar={numeroSemAno(r.protocoloNumero)} rotulo="nº do protocolo">
                <span className="font-mono text-[12px]">{r.protocoloNumero}</span>
              </CelulaCopiavel>
            ) : (
              <span className="text-faint">—</span>
            ),
        },
        {
          key: "dfd",
          header: "Nº DFD",
          nowrap: true,
          value: (r) => r.dfdNumero ?? "—",
          render: (r) => (
            <CelulaCopiavel copiar={r.dfdNumero} rotulo="nº do DFD">
              <span className="font-mono text-[12px]">{r.dfdNumero ?? "—"}</span>
            </CelulaCopiavel>
          ),
        },
      );
    cols.push(
      {
        key: "codigoProduto",
        header: "Código",
        nowrap: true,
        value: (r) => r.idProduto ?? "",
        render: (r) => (
          <CelulaCopiavel copiar={r.idProduto} rotulo="código do item">
            <span className="font-mono text-[12px]">{r.idProduto ?? "—"}</span>
          </CelulaCopiavel>
        ),
      },
      {
        key: "nome",
        header: "Produto",
        align: "left",
        minWidth: 260,
        value: (r) => r.nomeProduto ?? "",
        render: (r) => (
          <CelulaCopiavel copiar={r.nomeProduto} rotulo="descrição do item">
            <span className="line-clamp-2 font-medium text-text" title={r.nomeProduto ?? ""}>
              {r.nomeProduto ?? "—"}
            </span>
          </CelulaCopiavel>
        ),
      },
      {
        key: "classificacao",
        header: "Classificação",
        nowrap: true,
        value: (r) => r.classificacao ?? "",
        render: (r) => <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-text-2">{r.classificacao ?? "—"}</span>,
      },
    );
    if (showUnidade)
      cols.push({
        key: "codigo",
        header: "Unid.",
        nowrap: true,
        value: (r) => r.codigo ?? "",
        render: (r) => <span className="font-mono text-[12px] font-semibold text-text-2">{r.codigo ?? "—"}</span>,
      });
    cols.push(
      {
        key: "medida",
        header: "Medida",
        nowrap: true,
        value: (r) => r.unidadeMedida ?? "",
        render: (r) => <span className="text-muted">{r.unidadeMedida ?? "—"}</span>,
      },
      {
        key: "qtd",
        header: "Qtd.",
        nowrap: true,
        filter: "range",
        formatarFaixa: dec,
        numero: (r) => r.quantidade,
        render: (r) => <span className="tabular-nums text-text-2">{r.quantidade != null ? dec(r.quantidade) : "—"}</span>,
      },
      {
        key: "vlrRef",
        header: "Vlr. Ref.",
        align: "right",
        nowrap: true,
        filter: "range",
        numero: (r) => r.valorReferencia,
        render: (r) => <span className="tabular-nums text-text-2">{r.valorReferencia != null ? brl(r.valorReferencia) : "—"}</span>,
      },
      {
        key: "vlrTotal",
        header: "Vlr. Total",
        align: "right",
        nowrap: true,
        filter: "range",
        numero: (r) => r.valorTotal,
        render: (r) => <span className="font-semibold tabular-nums text-text">{r.valorTotal != null ? brl(r.valorTotal) : "—"}</span>,
      },
      {
        key: "data",
        header: "Data",
        nowrap: true,
        filter: "date",
        value: (r) => r.dataDesejada ?? "",
        render: (r) => <span className="tabular-nums text-muted">{dataBR(r.dataDesejada)}</span>,
      },
    );
    return cols;
  }, [showUnidade, origem]);

  return (
    <div>
      <div className="mb-4 w-full sm:max-w-sm">
        <SearchField value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} placeholder="Buscar produto ou código… (vários com :)" />
      </div>
      <DataTable
        columns={colunas}
        rows={filtradas}
        getKey={(r) => r.id}
        pageSize={20}
        density="compact"
        minWidth={origem ? 1180 : showUnidade ? 980 : 900}
        onRowClick={onRowClick}
        activeKey={ativo}
        resumo={(l) => `${l.length} ${l.length === 1 ? "item" : "itens"} · ${brl(l.reduce((s, r) => s + (r.valorTotal ?? 0), 0))}`}
      />
    </div>
  );
}
