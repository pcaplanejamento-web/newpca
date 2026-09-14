"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import {
  hojeISO,
  RESPONSAVEIS_VAZIO,
  type Responsaveis,
  responsavelVigente,
} from "@/lib/reparticao-responsaveis";
import { TextField } from "./Field";
import { IconPencil, IconPlus, IconRefresh, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { ReorderTable } from "./ReorderTable";
import { ResponsaveisEditor } from "./ResponsaveisEditor";
import { SkeletonLinhas } from "./Skeleton";

type Rep = {
  id: number;
  codigo: string;
  nome: string;
  ordem: number;
  numeroInteressado: string | null;
  responsaveis: Responsaveis;
};

export function ReparticoesAdmin() {
  const [lista, setLista] = useState<Rep[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Rep | "novo" | null>(null);
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [numeroInteressado, setNumeroInteressado] = useState("");
  const [responsaveis, setResponsaveis] = useState<Responsaveis>(RESPONSAVEIS_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [recarregando, setRecarregando] = useState(false);
  const hoje = hojeISO();

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch("/api/admin/reparticoes");
      const j = (await r.json()) as { ok?: boolean; error?: string; reparticoes?: Rep[] };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar.");
      setLista(j.reparticoes ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setLista([]);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function recarregar() {
    setRecarregando(true);
    await carregar();
    setRecarregando(false);
  }

  function abrirNovo() {
    setEditando("novo");
    setCodigo("");
    setNome("");
    setNumeroInteressado("");
    setResponsaveis(RESPONSAVEIS_VAZIO);
  }
  function abrirEdicao(r: Rep) {
    setEditando(r);
    setCodigo(r.codigo);
    setNome(r.nome);
    setNumeroInteressado(r.numeroInteressado ?? "");
    setResponsaveis(r.responsaveis);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const novo = editando === "novo";
      const r = await fetch(novo ? "/api/admin/reparticoes" : `/api/admin/reparticoes/${(editando as Rep).id}`, {
        method: novo ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo,
          nome,
          numeroInteressado: numeroInteressado.trim() || null,
          responsaveis,
        }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      setEditando(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(r: Rep) {
    if (!confirm(`Excluir a repartição "${r.nome}"?`)) return;
    await fetch(`/api/admin/reparticoes/${r.id}`, { method: "DELETE" });
    await carregar();
  }

  async function reordenar(ids: number[]) {
    // Mantém a nova ordem localmente (evita "voltar") e persiste.
    setLista((prev) => {
      if (!prev) return prev;
      const byId = new Map(prev.map((x) => [x.id, x]));
      return ids.map((id) => byId.get(id)).filter((x): x is Rep => !!x);
    });
    setErro(null);
    try {
      const r = await fetch("/api/admin/reparticoes/ordem", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setErro("Não foi possível salvar a nova ordem.");
      await carregar();
    }
  }

  if (lista === null) {
    return (
      <div className="rounded-card border border-border p-4">
        <SkeletonLinhas linhas={6} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Cadastre as repartições e suas siglas. Arraste para reordenar.</p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={recarregar} loading={recarregando} icon={<IconRefresh className="h-4 w-4" />}>
            Recarregar
          </Button>
          <Button onClick={abrirNovo} icon={<IconPlus className="h-[18px] w-[18px]" />}>
            Nova repartição
          </Button>
        </div>
      </div>

      {erro && <Callout kind="danger">{erro}</Callout>}

      <ReorderTable
        items={lista}
        getId={(r) => r.id}
        onReorder={(ids) => reordenar(ids as number[])}
        minWidth={820}
        dica="Arraste as linhas para reordenar. A nova ordem é salva automaticamente."
        preview={(r) => (
          <>
            <span className="mr-1.5 font-mono text-[11px] font-semibold text-accent">{r.codigo}</span>
            {r.nome}
          </>
        )}
        columns={[
          { header: "#", minWidth: 40, render: (_r, i) => <span className="tabular-nums text-faint">{i + 1}</span> },
          { header: "Código", minWidth: 100, render: (r) => <Badge tone="violet">{r.codigo}</Badge> },
          { header: "Nome da repartição", minWidth: 240, render: (r) => <span className="font-medium text-text">{r.nome}</span> },
          {
            header: "Nº interessado",
            minWidth: 120,
            render: (r) =>
              r.numeroInteressado ? (
                <span className="font-mono text-[12px] text-text-2">{r.numeroInteressado}</span>
              ) : (
                <span className="text-faint">—</span>
              ),
          },
          {
            header: "Responsável (DFDs)",
            minWidth: 180,
            render: (r) => {
              const vig = responsavelVigente(r.responsaveis, hoje);
              if (!vig) return <span className="text-faint">—</span>;
              return (
                <span className="line-clamp-1 text-text-2" title={vig.nome}>
                  {vig.nome}
                  {vig.tipo === "temporario" && (
                    <span className="ml-1.5 text-[10px] font-semibold uppercase" style={{ color: "var(--info)" }}>
                      temp.
                    </span>
                  )}
                </span>
              );
            },
          },
        ]}
        acoes={(r) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" onClick={() => abrirEdicao(r)} aria-label="Editar" icon={<IconPencil className="h-4 w-4" />} />
            <Button variant="ghost" onClick={() => excluir(r)} aria-label="Excluir" style={{ color: "var(--danger)" }} icon={<IconTrash className="h-4 w-4" />} />
          </div>
        )}
      />

      <Modal open={!!editando} onClose={() => setEditando(null)} titulo={editando === "novo" ? "Nova repartição" : "Editar repartição"}>
        <form onSubmit={salvar} className="space-y-4">
          <TextField label="Sigla (código)" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex.: AMAE" required />
          <TextField label="Nome da repartição" value={nome} onChange={(e) => setNome(e.target.value)} required />
          <TextField
            label="Número do interessado"
            value={numeroInteressado}
            onChange={(e) => setNumeroInteressado(e.target.value)}
            placeholder="Ex.: 1008171"
          />
          <div>
            <span className="mb-2 block text-[13px] font-semibold text-text">Responsáveis por DFDs</span>
            <ResponsaveisEditor valor={responsaveis} onChange={setResponsaveis} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button type="submit" loading={salvando}>
              Salvar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
