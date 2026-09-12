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
  {
    key: "vunit",
    header: "Vlr. unit.",
    align: "right",
    render: (r) => (r.valorUnitario != null ? brl(r.valorUnitario) : "—"),
  },
  {
    key: "vtot",
    header: "Vlr. total",
    align: "right",
    render: (r) => (r.valorTotal != null ? <span className="font-semibold">{brl(r.valorTotal)}</span> : "—"),
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

      {/* Seção 1 — Área requisitante */}
      <section className="rounded-card border border-border bg-surface p-5 shadow-ring">
        <h3 className="mb-3 text-sm font-bold text-text">1 · Área requisitante da demanda</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Campo label="Nº DFD" valor={dfd.numero} />
          <Campo label="Planejamento" valor={dfd.planejamento ?? "—"} />
          <Campo label="Repartição" valor={rep} />
          <Campo label="Órgão/Entidade" valor={dfd.orgaoEntidade ?? "—"} span />
          <Campo label="Setor Requisitante" valor={dfd.setorRequisitante ?? "—"} span />
          <Campo label="Responsável" valor={dfd.responsavel ?? "—"} />
          <Campo label="Matrícula" valor={dfd.matricula ?? "—"} />
          <Campo label="E-mail" valor={dfd.email ?? "—"} />
          <Campo label="Telefone" valor={dfd.telefone ?? "—"} />
        </div>
      </section>

      {/* Valores */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-card border border-border bg-surface p-4 shadow-ring">
          <div className="text-xs text-muted">Valor estimado (nota)</div>
          <div className="text-lg font-bold text-text">
            {dfd.valorEstimado != null ? brl(dfd.valorEstimado) : "—"}
          </div>
        </div>
        <div className="rounded-card border border-border bg-surface p-4 shadow-ring">
          <div className="text-xs text-muted">Valor total (tabela)</div>
          <div className="text-lg font-bold text-text">
            {dfd.valorTotal != null ? brl(dfd.valorTotal) : "—"}
          </div>
        </div>
      </div>

      {/* Seção 4 — Itens */}
      <section>
        <h3 className="mb-2 text-sm font-bold text-text">
          4 · Itens ({num(dfd.totalItens ?? dfd.itens.length)})
        </h3>
        <DataTable
          columns={COLS}
          rows={dfd.itens}
          getKey={(r) => r.id}
          minWidth={820}
          footer={`${dfd.itens.length} ${dfd.itens.length === 1 ? "item" : "itens"}`}
        />
      </section>

      {/* Demais seções (2, 3, 5, 6, 7, 8, 9…) */}
      {dfd.secoes.length > 0 && (
        <section className="space-y-3">
          {dfd.secoes.map((s) => (
            <div key={s.numero} className="rounded-card border border-border bg-surface p-5 shadow-ring">
              <h3 className="mb-1.5 text-sm font-bold text-text">
                {s.numero} · {s.titulo}
              </h3>
              <p className="whitespace-pre-line break-words text-[13.5px] leading-relaxed text-text-2">
                {s.texto}
              </p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Campo({ label, valor, span }: { label: string; valor: string; span?: boolean }) {
  return (
    <div className={span ? "col-span-2 sm:col-span-1" : ""}>
      <div className="text-xs text-muted">{label}</div>
      <div className="break-words font-semibold text-text" title={valor}>
        {valor}
      </div>
    </div>
  );
}
