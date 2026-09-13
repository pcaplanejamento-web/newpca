"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DfdDetalhe, DfdResumo } from "@/lib/dfd";
import { brl, num } from "@/lib/format";
import type { ProtocoloDetalhe, ProtocoloResumo } from "@/lib/protocolo";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { DfdUploadForm } from "./DfdUploadForm";
import { DfdView } from "./DfdView";
import { inputCls, labelCls } from "./formStyles";
import { IconAlert, IconClipboard, IconFile, IconLayers, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { ProtocoloUploadForm } from "./ProtocoloUploadForm";
import { ProtocoloView } from "./ProtocoloView";
import { Tabs } from "./Tabs";

type Rep = { id: number; codigo: string; nome: string };

const valorDe = (r: DfdResumo) => r.valorTotal ?? r.valorEstimado ?? 0;

export function DfdsView({
  podeEditar,
  dfds,
  protocolos,
  reparticoes,
  reparticaoAtivaId,
}: {
  podeEditar: boolean;
  dfds: DfdResumo[];
  protocolos: ProtocoloResumo[];
  reparticoes: Rep[];
  reparticaoAtivaId: number | null;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [dfdView, setDfdView] = useState<DfdDetalhe | null>(null);
  const [protoView, setProtoView] = useState<ProtocoloDetalhe | null>(null);
  const [vincAlvo, setVincAlvo] = useState<{ id: number; numero: string } | null>(null);
  const [vincSel, setVincSel] = useState<number | null>(null);
  const [salvandoVinc, setSalvandoVinc] = useState(false);

  async function verDfd(id: number) {
    setErro(null);
    try {
      const res = await fetch(`/api/dfd/${id}`);
      const j = (await res.json()) as { ok?: boolean; error?: string; dfd?: DfdDetalhe };
      if (!res.ok || !j.ok || !j.dfd) throw new Error(j.error ?? "Não foi possível abrir o DFD.");
      setDfdView(j.dfd);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o DFD.");
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

  async function verProtocolo(id: number) {
    setErro(null);
    try {
      const res = await fetch(`/api/protocolo/${id}`);
      const j = (await res.json()) as { ok?: boolean; error?: string; protocolo?: ProtocoloDetalhe };
      if (!res.ok || !j.ok || !j.protocolo) throw new Error(j.error ?? "Não foi possível abrir o protocolo.");
      setProtoView(j.protocolo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o protocolo.");
    }
  }

  async function excluirProtocolo(id: number, numero: string) {
    if (!confirm(`Excluir o protocolo ${numero}? Os DFDs continuam cadastrados (apenas desvinculados).`)) return;
    setErro(null);
    const res = await fetch(`/api/protocolo/${id}`, { method: "DELETE" });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      setErro(j.error ?? "Não foi possível excluir o protocolo.");
      return;
    }
    router.refresh();
  }

  function abrirVincular(d: DfdResumo) {
    setErro(null);
    setVincAlvo({ id: d.id, numero: d.numero });
    setVincSel(d.protocoloId);
  }

  async function salvarVincular() {
    if (!vincAlvo) return;
    setSalvandoVinc(true);
    setErro(null);
    try {
      const res = await fetch(`/api/dfd/${vincAlvo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protocoloId: vincSel }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Não foi possível vincular.");
      setVincAlvo(null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível vincular.");
    } finally {
      setSalvandoVinc(false);
    }
  }

  // ---- Colunas da tabela de DFDs ----
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
    { key: "numero", header: "Nº DFD", value: (r) => r.numero, render: (r) => <span className="font-mono">{r.numero}</span> },
    {
      key: "protocolo",
      header: "Protocolo",
      value: (r) => r.protocoloNumero ?? "—",
      render: (r) =>
        r.protocoloNumero ? (
          <span className="font-mono text-[12px]">{r.protocoloNumero}</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
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
      minWidth: 150,
      value: (r) => r.setorRequisitante ?? "—",
      render: (r) => <span className="line-clamp-1">{r.setorRequisitante ?? "—"}</span>,
    },
    { key: "itens", header: "Itens", align: "right", value: (r) => String(r.totalItens ?? 0), render: (r) => num(r.totalItens ?? 0) },
    { key: "valor", header: "Valor", align: "right", value: (r) => String(valorDe(r)), render: (r) => brl(valorDe(r)) },
    {
      key: "acoes",
      header: "",
      filter: "none",
      render: (r) =>
        podeEditar ? (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              aria-label="Vincular a protocolo"
              onClick={() => abrirVincular(r)}
              icon={<IconLayers className="h-4 w-4" />}
            />
            <Button
              variant="ghost"
              aria-label="Excluir DFD"
              onClick={() => excluirDfd(r.id, r.numero)}
              icon={<IconTrash className="h-4 w-4" />}
              style={{ color: "var(--danger)" }}
            />
          </div>
        ) : null,
    },
  ];

  // ---- Colunas da tabela de Protocolos ----
  const colsProto: Column<ProtocoloResumo>[] = [
    { key: "numero", header: "Nº processo", value: (r) => r.numero, render: (r) => <span className="font-mono">{r.numero}</span> },
    {
      key: "interessado",
      header: "Interessado",
      minWidth: 200,
      value: (r) => r.interessado ?? "—",
      render: (r) => <span className="line-clamp-1">{r.interessado ?? "—"}</span>,
    },
    {
      key: "reparticao",
      header: "Repartição",
      value: (r) => r.reparticaoCodigo ?? "—",
      render: (r) =>
        r.reparticaoCodigo ? (
          <span className="font-mono text-[12px] font-semibold text-accent">{r.reparticaoCodigo}</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    { key: "dfds", header: "DFDs", align: "right", filter: "none", render: (r) => num(r.totalDfds) },
    { key: "itens", header: "Itens", align: "right", filter: "none", render: (r) => num(r.totalItens) },
    { key: "valor", header: "Valor", align: "right", filter: "none", render: (r) => brl(r.valorTotal) },
    {
      key: "acoes",
      header: "",
      filter: "none",
      render: (r) =>
        podeEditar ? (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              aria-label="Excluir protocolo"
              onClick={() => excluirProtocolo(r.id, r.numero)}
              icon={<IconTrash className="h-4 w-4" />}
              style={{ color: "var(--danger)" }}
            />
          </div>
        ) : null,
    },
  ];

  const protocolosTab = (
    <div className="space-y-6">
      {podeEditar && (
        <ProtocoloUploadForm
          reparticoes={reparticoes}
          reparticaoAtivaId={reparticaoAtivaId}
          dfdsExistentes={dfds.map((d) => ({ numero: d.numero, protocoloNumero: d.protocoloNumero }))}
        />
      )}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-text-2">Protocolos ({protocolos.length})</h3>
        {protocolos.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
            Nenhum protocolo nesta visão. {podeEditar ? "Envie o PDF de um protocolo acima." : ""}
          </p>
        ) : (
          <DataTable
            columns={colsProto}
            rows={protocolos}
            getKey={(r) => r.id}
            onRowClick={(r) => verProtocolo(r.id)}
            pageSize={25}
            minWidth={820}
            resumo={(linhas) =>
              `${linhas.length} protocolo${linhas.length === 1 ? "" : "s"} · ${num(
                linhas.reduce((s, p) => s + p.totalDfds, 0),
              )} DFDs · ${brl(linhas.reduce((s, p) => s + p.valorTotal, 0))}`
            }
          />
        )}
      </section>
    </div>
  );

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
            onRowClick={(r) => verDfd(r.id)}
            pageSize={25}
            minWidth={1040}
            resumo={(linhas) =>
              `${linhas.length} DFD${linhas.length === 1 ? "" : "s"} · ${num(
                linhas.reduce((s, d) => s + (d.totalItens ?? 0), 0),
              )} itens · ${brl(linhas.reduce((s, d) => s + valorDe(d), 0))}`
            }
          />
        )}
      </section>
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
          { key: "protocolos", label: "Protocolos", icon: <IconClipboard className="h-4 w-4" />, content: protocolosTab },
          { key: "dfds", label: "DFDs", icon: <IconFile className="h-4 w-4" />, content: dfdsTab },
        ]}
      />

      {/* Banner: DFD completo (mesmo componente da importação) */}
      <Modal open={!!dfdView} onClose={() => setDfdView(null)} titulo={dfdView ? `DFD ${dfdView.numero}` : ""} size="lg">
        {dfdView && <DfdView dfd={dfdView} />}
      </Modal>

      {/* Banner: protocolo completo + seus DFDs */}
      <Modal open={!!protoView} onClose={() => setProtoView(null)} titulo={protoView ? `Protocolo ${protoView.numero}` : ""} size="xl">
        {protoView && <ProtocoloView protocolo={protoView} onVerDfd={verDfd} />}
      </Modal>

      {/* Vincular DFD a um protocolo (rule 4) */}
      <Modal
        open={!!vincAlvo}
        onClose={() => setVincAlvo(null)}
        titulo={vincAlvo ? `Vincular DFD ${vincAlvo.numero}` : ""}
        size="md"
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVincAlvo(null)} disabled={salvandoVinc}>
              Cancelar
            </Button>
            <Button onClick={salvarVincular} loading={salvandoVinc}>
              Salvar
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className={labelCls} htmlFor="vinc-proto">
            Protocolo
          </label>
          <select
            id="vinc-proto"
            className={inputCls}
            value={vincSel ?? ""}
            onChange={(e) => setVincSel(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— Nenhum (desvincular) —</option>
            {protocolos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.numero}
                {p.interessado ? ` · ${p.interessado}` : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-faint">
            {protocolos.length === 0
              ? "Nenhum protocolo cadastrado ainda — crie um na aba Protocolos."
              : 'Vincule este DFD a um protocolo, ou escolha "Nenhum" para desvincular.'}
          </p>
        </div>
      </Modal>
    </div>
  );
}
