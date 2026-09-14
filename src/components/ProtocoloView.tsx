"use client";

import { brl, dataBR, num } from "@/lib/format";
import { valoresBatem } from "@/lib/normalize";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { TextField } from "./Field";
import { inputCls, labelCls } from "./formStyles";
import { IconAlert } from "./icons";
import { StatMini } from "./StatMini";

/** Campos editáveis do protocolo (banner destravado). */
export type ProtocoloEdicaoValores = {
  data: string;
  interessado: string;
  documento: string;
  assunto: string;
  observacao: string;
  reparticaoId: number | null;
  valorCapa: number | null;
};
export type ProtocoloEdicao = {
  trancado: boolean;
  reparticoes: { id: number; codigo: string; nome: string }[];
  valores: ProtocoloEdicaoValores;
  onChange: (patch: Partial<ProtocoloEdicaoValores>) => void;
};

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
  idExterno: string | null;
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
  edicao,
}: {
  protocolo: ProtocoloVisual;
  onVerDfd?: (id: number) => void;
  edicao?: ProtocoloEdicao;
}) {
  const editando = !!edicao && !edicao.trancado;
  const rep =
    protocolo.reparticaoCodigo || protocolo.reparticaoNome
      ? `${protocolo.reparticaoCodigo ?? ""}${protocolo.reparticaoNome ? ` · ${protocolo.reparticaoNome}` : ""}`
      : "Sem repartição";
  // Valor da capa × somatória dos valores dos DFDs (o valor de cada DFD é a soma dos
  // seus itens). Divergência é apontada; no modo edição dá para substituir a capa
  // pela somatória (regras 3/4). Em edição usa o valor sendo editado.
  const valorCapaAtual = editando && edicao ? edicao.valores.valorCapa : protocolo.valorCapa;
  const capaDivergente = valorCapaAtual != null && !valoresBatem(valorCapaAtual, protocolo.valorTotal);

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

      {/* Head — mini banners (um por informação): total de DFDs + somatória dos valores. */}
      <div className="grid grid-cols-3 gap-3">
        <StatMini label="Total de DFDs" value={num(protocolo.totalDfds)} />
        <StatMini label="Total de itens" value={num(protocolo.totalItens)} />
        <StatMini
          label="Somatória dos DFDs"
          value={brl(protocolo.valorTotal)}
          tone={capaDivergente ? "warn" : "default"}
        />
      </div>

      {capaDivergente && (
        <Callout kind={editando ? "danger" : "warn"} icon={<IconAlert className="h-5 w-5" />}>
          <p className="font-semibold">O valor da capa diverge da somatória dos DFDs</p>
          <p className="mt-1 opacity-90">
            Valor da capa: {brl(valorCapaAtual)} · Somatória dos DFDs: {brl(protocolo.valorTotal)}.
          </p>
          {editando && edicao && (
            <div className="mt-2">
              <Button variant="secondary" onClick={() => edicao.onChange({ valorCapa: protocolo.valorTotal })}>
                Substituir pela somatória ({brl(protocolo.valorTotal)})
              </Button>
            </div>
          )}
        </Callout>
      )}

      <section className="rounded-card border border-border bg-surface p-5 shadow-ring">
        <h3 className="mb-4 text-sm font-bold text-text">Dados do processo</h3>
        {editando && edicao ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Id do processo" value={protocolo.idExterno ?? ""} disabled readOnly />
            <TextField label="Valor (capa)" value={valorCapaAtual != null ? brl(valorCapaAtual) : "—"} disabled readOnly />
            <TextField label="Data/Hora" value={edicao.valores.data} onChange={(e) => edicao.onChange({ data: e.target.value })} />
            <TextField label="CPF/CNPJ" value={edicao.valores.documento} onChange={(e) => edicao.onChange({ documento: e.target.value })} />
            <div className="sm:col-span-2">
              <TextField label="Interessado" value={edicao.valores.interessado} onChange={(e) => edicao.onChange({ interessado: e.target.value })} />
            </div>
            <TextField label="Assunto" value={edicao.valores.assunto} onChange={(e) => edicao.onChange({ assunto: e.target.value })} />
            <TextField label="Observação" value={edicao.valores.observacao} onChange={(e) => edicao.onChange({ observacao: e.target.value })} />
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="proto-edit-rep">
                Repartição
              </label>
              <select
                id="proto-edit-rep"
                className={inputCls}
                value={edicao.valores.reparticaoId ?? ""}
                onChange={(e) => edicao.onChange({ reparticaoId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">— Selecione a repartição —</option>
                {edicao.reparticoes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.codigo} · {r.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
            <Campo label="Nº do processo" valor={protocolo.numero} />
            <Campo label="Id do processo" valor={protocolo.idExterno ?? "—"} />
            <Campo label="Data/Hora" valor={protocolo.data ?? "—"} />
            <Campo label="Interessado" valor={protocolo.interessado ?? "—"} span />
            <Campo label="CPF/CNPJ" valor={protocolo.documento ?? "—"} />
            <Campo label="Valor (capa)" valor={protocolo.valorCapa != null ? brl(protocolo.valorCapa) : "—"} />
            <Campo label="Assunto" valor={protocolo.assunto ?? "—"} span />
            <Campo label="Observação" valor={protocolo.observacao ?? "—"} span />
            <Campo label="Repartição" valor={rep} span />
            <Campo label="Local (capa)" valor={protocolo.localReparticao ?? "—"} span />
          </dl>
        )}
      </section>

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

