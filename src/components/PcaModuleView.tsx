"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import type { DfdResumo, PcaResumo } from "@/lib/dfd";
import { brl, dataBR, num } from "@/lib/format";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { DfdUploadForm } from "./DfdUploadForm";
import { TextField } from "./Field";
import {
  IconAlert,
  IconBuilding,
  IconChevronRight,
  IconClipboard,
  IconDashboard,
  IconLayers,
  IconPlus,
  IconTrash,
} from "./icons";
import { Modal } from "./Modal";
import { Tabs } from "./Tabs";
import { UploadForm } from "./UploadForm";

type Unidade = {
  id: number;
  codigo: string;
  municipio: string;
  totalItens: number | null;
  valorTotal: number | null;
  atualizadoEm: string | null;
};
type Rep = { id: number; codigo: string; nome: string };

export function PcaModuleView({
  podeEditar,
  unidades,
  dfds,
  todosDfds,
  pcas,
  reparticoes,
  reparticaoAtivaId,
}: {
  podeEditar: boolean;
  unidades: Unidade[];
  dfds: DfdResumo[];
  todosDfds: DfdResumo[];
  pcas: PcaResumo[];
  reparticoes: Rep[];
  reparticaoAtivaId: number | null;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [modalGerar, setModalGerar] = useState(false);
  const [nome, setNome] = useState("");
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [salvando, setSalvando] = useState(false);

  async function excluirDfd(id: number, numero: string) {
    if (!confirm(`Excluir o DFD ${numero}?`)) return;
    setErro(null);
    const res = await fetch(`/api/dfd/${id}`, { method: "DELETE" });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      setErro(j.error ?? "Não foi possível excluir o DFD.");
      return;
    }
    router.refresh();
  }

  async function excluirPca(id: number, nomePca: string) {
    if (!confirm(`Excluir a edição de PCA "${nomePca}"?`)) return;
    setErro(null);
    await fetch(`/api/pca/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function gerar() {
    setSalvando(true);
    setErro(null);
    try {
      const dfdIds = [...sel].map((k) => Number(k));
      const res = await fetch("/api/pca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, ano: ano ? Number(ano) : null, dfdIds }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao gerar a edição.");
      setModalGerar(false);
      setNome("");
      setSel(new Set());
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar a edição.");
    } finally {
      setSalvando(false);
    }
  }

  const acao = (children: ReactNode) => <div className="flex justify-end gap-1">{children}</div>;

  const colsDfd: Column<DfdResumo>[] = [
    {
      key: "reparticao",
      header: "Repartição",
      value: (r) => r.reparticaoCodigo ?? "—",
      render: (r) =>
        r.reparticaoCodigo ? (
          <span>
            <span className="font-mono text-[12px] font-semibold text-accent">{r.reparticaoCodigo}</span>
            <span className="text-muted"> · {r.reparticaoNome}</span>
          </span>
        ) : (
          <span className="text-faint">Sem repartição</span>
        ),
    },
    { key: "numero", header: "Nº DFD", filter: "none", render: (r) => <span className="font-mono">{r.numero}</span> },
    { key: "objeto", header: "Objeto", filter: "none", minWidth: 200, render: (r) => <span className="line-clamp-1">{r.objeto ?? "—"}</span> },
    { key: "setor", header: "Setor", filter: "none", minWidth: 160, render: (r) => <span className="line-clamp-1">{r.setorRequisitante ?? "—"}</span> },
    { key: "itens", header: "Itens", align: "right", filter: "none", render: (r) => num(r.totalItens ?? 0) },
    { key: "valor", header: "Estimado", align: "right", filter: "none", render: (r) => (r.valorEstimado != null ? brl(r.valorEstimado) : "—") },
    {
      key: "acoes",
      header: "",
      filter: "none",
      render: (r) =>
        acao(
          <>
            <Button href={`/painel/pca/dfd/${r.id}`} variant="ghost">
              Ver
            </Button>
            {podeEditar && (
              <Button
                variant="ghost"
                aria-label="Excluir DFD"
                onClick={() => excluirDfd(r.id, r.numero)}
                icon={<IconTrash className="h-4 w-4" />}
                style={{ color: "var(--danger)" }}
              />
            )}
          </>,
        ),
    },
  ];

  const colsPca: Column<PcaResumo>[] = [
    { key: "nome", header: "Edição", filter: "none", render: (r) => <span className="font-semibold text-text">{r.nome}</span> },
    { key: "ano", header: "Ano", align: "right", filter: "none", render: (r) => r.ano ?? "—" },
    { key: "dfds", header: "DFDs", align: "right", filter: "none", render: (r) => num(r.totalDfds ?? 0) },
    { key: "itens", header: "Itens", align: "right", filter: "none", render: (r) => num(r.totalItens ?? 0) },
    { key: "valor", header: "Estimado", align: "right", filter: "none", render: (r) => brl(r.valorEstimado ?? 0) },
    { key: "criadoEm", header: "Gerado", filter: "none", render: (r) => (r.criadoEm ? dataBR(r.criadoEm) : "—") },
    {
      key: "acoes",
      header: "",
      filter: "none",
      render: (r) =>
        acao(
          <>
            <Button href={`/painel/pca/edicao/${r.id}`} variant="ghost">
              Ver
            </Button>
            {podeEditar && (
              <Button
                variant="ghost"
                aria-label="Excluir edição"
                onClick={() => excluirPca(r.id, r.nome)}
                icon={<IconTrash className="h-4 w-4" />}
                style={{ color: "var(--danger)" }}
              />
            )}
          </>,
        ),
    },
  ];

  const colsPicker: Column<DfdResumo>[] = [
    { key: "numero", header: "Nº DFD", filter: "none", render: (r) => <span className="font-mono">{r.numero}</span> },
    { key: "reparticao", header: "Repartição", value: (r) => r.reparticaoCodigo ?? "—", render: (r) => r.reparticaoCodigo ?? <span className="text-faint">—</span> },
    { key: "objeto", header: "Objeto", filter: "none", minWidth: 200, render: (r) => <span className="line-clamp-1">{r.objeto ?? "—"}</span> },
    { key: "valor", header: "Estimado", align: "right", filter: "none", render: (r) => (r.valorEstimado != null ? brl(r.valorEstimado) : "—") },
  ];

  // ---- Painel: Planilha (PCA) achatada — fluxo atual, intacto ----
  const planilhaTab = (
    <div className="space-y-6">
      <Link
        href="/"
        className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 shadow-ring transition hover:border-border-2 hover:shadow-soft"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
          <IconDashboard className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-text">Dashboard do PCA</h3>
          <p className="mt-0.5 text-sm text-muted">
            Indicadores, gráficos e consulta de itens — página pública (todos veem).
          </p>
        </div>
        <IconChevronRight className="h-5 w-5 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-muted" />
      </Link>

      {podeEditar ? (
        <UploadForm />
      ) : (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
          A importação de planilhas é feita por administradores e gestores.
        </p>
      )}

      {unidades.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-text-2">Unidades importadas ({unidades.length})</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {unidades.map((un) => (
              <div key={un.id} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                  <IconBuilding className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-text" title={un.municipio}>
                    {un.municipio}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    Código {un.codigo} · {num(un.totalItens ?? 0)} itens · {brl(un.valorTotal ?? 0)}
                  </div>
                  {un.atualizadoEm && (
                    <div className="mt-0.5 text-[11px] text-faint">atualizado em {dataBR(un.atualizadoEm)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );

  // ---- DFDs importados ----
  const dfdsTab = (
    <div className="space-y-6">
      {podeEditar && <DfdUploadForm reparticoes={reparticoes} reparticaoAtivaId={reparticaoAtivaId} />}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-text-2">DFDs importados ({dfds.length})</h3>
        {dfds.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
            Nenhum DFD importado nesta visão. {podeEditar ? "Importe um DFD acima." : ""}
          </p>
        ) : (
          <DataTable
            columns={colsDfd}
            rows={dfds}
            getKey={(r) => r.id}
            pageSize={25}
            minWidth={900}
            footer={`${dfds.length} DFD${dfds.length === 1 ? "" : "s"}`}
          />
        )}
      </section>
    </div>
  );

  // ---- Edições de PCA ----
  const pcaTab = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Una DFDs numa edição de PCA (o plano consolidado).</p>
        {podeEditar && (
          <Button
            onClick={() => {
              setSel(new Set());
              setNome("");
              setModalGerar(true);
            }}
            icon={<IconPlus className="h-[18px] w-[18px]" />}
            disabled={todosDfds.length === 0}
          >
            Gerar PCA
          </Button>
        )}
      </div>

      {pcas.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
          Nenhuma edição de PCA gerada ainda.
        </p>
      ) : (
        <DataTable columns={colsPca} rows={pcas} getKey={(r) => r.id} minWidth={720} footer={`${pcas.length} ediç${pcas.length === 1 ? "ão" : "ões"}`} />
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {erro && (
        <Callout kind="danger" icon={<IconAlert className="h-5 w-5" />}>
          {erro}
        </Callout>
      )}

      <Tabs
        tabs={[
          { key: "planilha", label: "Planilha (PCA)", icon: <IconDashboard className="h-4 w-4" />, content: planilhaTab },
          { key: "dfds", label: "DFDs", icon: <IconClipboard className="h-4 w-4" />, content: dfdsTab },
          { key: "pca", label: "PCA", icon: <IconLayers className="h-4 w-4" />, content: pcaTab },
        ]}
      />

      <Modal open={modalGerar} onClose={() => setModalGerar(false)} titulo="Gerar edição de PCA" size="lg" scrollable>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <TextField label="Nome da edição" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: PCA 2026" />
            </div>
            <TextField label="Ano" value={ano} onChange={(e) => setAno(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" />
          </div>

          <div>
            <div className="mb-2 text-[13.5px] font-bold text-text">
              DFDs a unir ({sel.size} selecionado{sel.size === 1 ? "" : "s"})
            </div>
            {todosDfds.length === 0 ? (
              <Callout kind="info">Importe DFDs antes de gerar uma edição.</Callout>
            ) : (
              <DataTable
                columns={colsPicker}
                rows={todosDfds}
                getKey={(r) => r.id}
                selectable
                selected={sel}
                onSelected={setSel}
                pageSize={8}
                minWidth={560}
                footer={`${todosDfds.length} DFD${todosDfds.length === 1 ? "" : "s"} disponíveis`}
              />
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalGerar(false)}>
              Cancelar
            </Button>
            <Button onClick={gerar} loading={salvando} disabled={!nome.trim() || sel.size === 0}>
              Gerar edição
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
