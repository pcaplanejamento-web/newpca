"use client";

import { brl, dataBR, num } from "@/lib/format";
import { type Column, DataTable } from "./DataTable";

/**
 * Visão COMPLETA (read-only) do protocolo — metadados da capa + a lista dos DFDs
 * que ele reúne. Componente presentacional (forma estrutural satisfeita por
 * `ProtocoloDetalhe`); o "Ver" de cada DFD é delegado via `onVerDfd` (opcional,
 * para catalogar com mock sem buscar dados).
 */
export type ProtocoloVisualDfd = {
  id: number;
  numero: string;
  setorRequisitante: string | null;
  reparticaoCodigo: string | null;
  totalItens: number | null;
  valorTotal: number | null;
  valorEstimado: number | null;
};

export type ProtocoloVisual = {
  numero: string;
  data: string | null;
  interessado: string | null;
  documento: string | null;
  assunto: string | null;
  observacao: string | null;
  localReparticao: string | null;
  valorCapa: number | null;
  reparticaoCodigo: string | null;
  reparticaoNome: string | null;
  criadoEm?: string | null;
  totalDfds: number;
  totalItens: number;
  valorTotal: number;
  dfds: ProtocoloVisualDfd[];
};

const valorDfd = (d: ProtocoloVisualDfd) => d.valorTotal ?? d.valorEstimado ?? 0;

export function ProtocoloView({
  protocolo,
  onVerDfd,
}: {
  protocolo: ProtocoloVisual;
  onVerDfd?: (id: number) => void;
}) {
  const rep =
    protocolo.reparticaoCodigo || protocolo.reparticaoNome
      ? `${protocolo.reparticaoCodigo ?? ""}${protocolo.reparticaoNome ? ` · ${protocolo.reparticaoNome}` : ""}`
      : "Sem repartição";

  const cols: Column<ProtocoloVisualDfd>[] = [
    { key: "numero", header: "Nº DFD", filter: "none", render: (r) => <span className="font-mono">{r.numero}</span> },
    {
      key: "setor",
      header: "Setor",
      filter: "none",
      minWidth: 180,
      render: (r) => <span className="line-clamp-1">{r.setorRequisitante ?? "—"}</span>,
    },
    {
      key: "rep",
      header: "Repartição",
      filter: "none",
      render: (r) =>
        r.reparticaoCodigo ? (
          <span className="font-mono text-[12px] font-semibold text-accent">{r.reparticaoCodigo}</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    { key: "itens", header: "Itens", align: "right", filter: "none", render: (r) => num(r.totalItens ?? 0) },
    { key: "valor", header: "Valor", align: "right", filter: "none", render: (r) => brl(valorDfd(r)) },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-text">Protocolo {protocolo.numero}</h2>
        <p className="mt-0.5 text-sm text-muted">{protocolo.assunto || "Processo administrativo"}</p>
      </div>

      <section className="rounded-card border border-border bg-surface p-5 shadow-ring">
        <h3 className="mb-4 text-sm font-bold text-text">Dados do processo</h3>
        <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
          <Campo label="Nº do processo" valor={protocolo.numero} />
          <Campo label="Data/Hora" valor={protocolo.data ?? "—"} />
          <Campo label="Interessado" valor={protocolo.interessado ?? "—"} span />
          <Campo label="CPF/CNPJ" valor={protocolo.documento ?? "—"} />
          <Campo label="Valor (capa)" valor={protocolo.valorCapa != null ? brl(protocolo.valorCapa) : "—"} />
          <Campo label="Assunto" valor={protocolo.assunto ?? "—"} span />
          <Campo label="Observação" valor={protocolo.observacao ?? "—"} span />
          <Campo label="Repartição" valor={rep} span />
          <Campo label="Local (capa)" valor={protocolo.localReparticao ?? "—"} span />
        </dl>
      </section>

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="DFDs" valor={num(protocolo.totalDfds)} />
        <Kpi label="Itens" valor={num(protocolo.totalItens)} />
        <Kpi label="Valor total" valor={brl(protocolo.valorTotal)} />
      </div>

      <section>
        <h3 className="mb-2 text-sm font-bold text-text">DFDs do protocolo ({protocolo.dfds.length})</h3>
        {protocolo.dfds.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
            Nenhum DFD vinculado a este protocolo ainda.
          </p>
        ) : (
          <DataTable
            columns={cols}
            rows={protocolo.dfds}
            getKey={(r) => r.id}
            onRowClick={onVerDfd ? (r) => onVerDfd(r.id) : undefined}
            minWidth={620}
            pageSize={20}
            footer={`${protocolo.dfds.length} DFD${protocolo.dfds.length === 1 ? "" : "s"}`}
          />
        )}
      </section>

      {protocolo.criadoEm && (
        <p className="text-[11px] text-faint">Protocolado em {dataBR(protocolo.criadoEm)}.</p>
      )}
    </div>
  );
}

function Campo({ label, valor, span }: { label: string; valor: string; span?: boolean }) {
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 break-words font-semibold leading-snug text-text">{valor}</dd>
    </div>
  );
}

function Kpi({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-ring">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-bold text-text">{valor}</div>
    </div>
  );
}
