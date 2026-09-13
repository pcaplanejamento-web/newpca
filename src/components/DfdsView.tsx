"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DfdDetalhe, DfdResumo } from "@/lib/dfd";
import { brl, num } from "@/lib/format";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { DfdUploadForm } from "./DfdUploadForm";
import { DfdView } from "./DfdView";
import { IconAlert, IconTrash } from "./icons";
import { Modal } from "./Modal";

type Rep = { id: number; codigo: string; nome: string };

const valorDe = (r: DfdResumo) => r.valorTotal ?? r.valorEstimado ?? 0;

export function DfdsView({
  podeEditar,
  dfds,
  reparticoes,
  reparticaoAtivaId,
}: {
  podeEditar: boolean;
  dfds: DfdResumo[];
  reparticoes: Rep[];
  reparticaoAtivaId: number | null;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [dfdView, setDfdView] = useState<DfdDetalhe | null>(null);
  const [carregandoView, setCarregandoView] = useState<number | null>(null);

  async function verDfd(id: number) {
    setErro(null);
    setCarregandoView(id);
    try {
      const res = await fetch(`/api/dfd/${id}`);
      const j = (await res.json()) as { ok?: boolean; error?: string; dfd?: DfdDetalhe };
      if (!res.ok || !j.ok || !j.dfd) throw new Error(j.error ?? "Não foi possível abrir o DFD.");
      setDfdView(j.dfd);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o DFD.");
    } finally {
      setCarregandoView(null);
    }
  }

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

  // Todas as colunas com `value` = filtráveis/ordenáveis pelo cabeçalho (menos Ações).
  const cols: Column<DfdResumo>[] = [
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
    { key: "numero", header: "Nº DFD", value: (r) => r.numero, render: (r) => <span className="font-mono">{r.numero}</span> },
    {
      key: "objeto",
      header: "Objeto",
      minWidth: 180,
      value: (r) => r.objeto ?? "—",
      render: (r) => <span className="line-clamp-1">{r.objeto ?? "—"}</span>,
    },
    {
      key: "setor",
      header: "Setor",
      minWidth: 160,
      value: (r) => r.setorRequisitante ?? "—",
      render: (r) => <span className="line-clamp-1">{r.setorRequisitante ?? "—"}</span>,
    },
    { key: "itens", header: "Itens", align: "right", value: (r) => String(r.totalItens ?? 0), render: (r) => num(r.totalItens ?? 0) },
    { key: "valor", header: "Valor", align: "right", value: (r) => String(valorDe(r)), render: (r) => brl(valorDe(r)) },
    {
      key: "acoes",
      header: "",
      filter: "none",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" onClick={() => verDfd(r.id)} loading={carregandoView === r.id}>
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
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {erro && (
        <Callout kind="danger" icon={<IconAlert className="h-5 w-5" />}>
          {erro}
        </Callout>
      )}

      {podeEditar && <DfdUploadForm reparticoes={reparticoes} reparticaoAtivaId={reparticaoAtivaId} />}

      <section>
        <h3 className="mb-3 text-sm font-semibold text-text-2">DFDs importados ({dfds.length})</h3>
        {dfds.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
            Nenhum DFD importado nesta visão. {podeEditar ? "Importe um DFD acima." : ""}
          </p>
        ) : (
          <DataTable
            columns={cols}
            rows={dfds}
            getKey={(r) => r.id}
            pageSize={25}
            minWidth={920}
            resumo={(linhas) =>
              `${linhas.length} DFD${linhas.length === 1 ? "" : "s"} · ${num(
                linhas.reduce((s, d) => s + (d.totalItens ?? 0), 0),
              )} itens · ${brl(linhas.reduce((s, d) => s + valorDe(d), 0))}`
            }
          />
        )}
      </section>

      {/* Banner flutuante: visualizar o DFD completo (mesmo componente da importação) */}
      <Modal open={!!dfdView} onClose={() => setDfdView(null)} titulo={dfdView ? `DFD ${dfdView.numero}` : ""} size="lg">
        {dfdView && <DfdView dfd={dfdView} />}
      </Modal>
    </div>
  );
}
