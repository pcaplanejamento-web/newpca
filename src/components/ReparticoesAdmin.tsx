"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  hojeISO,
  RESPONSAVEIS_VAZIO,
  type Responsaveis,
  responsaveisVigentes,
} from "@/lib/reparticao-responsaveis";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { TextField } from "./Field";
import { IconArrowDown, IconArrowUp, IconChevronLeft, IconPencil, IconPlus, IconRefresh, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { ResponsaveisEditor } from "./ResponsaveisEditor";
import { SkeletonLinhas } from "./Skeleton";

type Rep = {
  id: number;
  codigo: string;
  nome: string;
  ordem: number;
  numeroInteressado: string | null;
  setorRequisitante: string | null;
  orgaoId: number | null;
  responsaveis: Responsaveis;
};

/**
 * CRUD das UNIDADES de UM órgão — a tela vive DENTRO de `/painel/orgaos/[id]`.
 * O órgão vem do escopo (URL), então a unidade herda `orgaoId` sem um seletor: toda
 * unidade já nasce dentro do seu órgão. Ordenação por botões ↑/↓ (persistida).
 */
export function ReparticoesAdmin({ orgaoId, orgaoNome }: { orgaoId: number; orgaoNome: string }) {
  const router = useRouter();
  const [lista, setLista] = useState<Rep[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Rep | "novo" | null>(null);
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [numeroInteressado, setNumeroInteressado] = useState("");
  const [setorRequisitante, setSetorRequisitante] = useState("");
  const [responsaveis, setResponsaveis] = useState<Responsaveis>(RESPONSAVEIS_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [recarregando, setRecarregando] = useState(false);
  const hoje = hojeISO();

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch(`/api/admin/reparticoes?orgaoId=${orgaoId}`);
      const j = (await r.json()) as { ok?: boolean; error?: string; reparticoes?: Rep[] };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar.");
      setLista(j.reparticoes ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setLista([]);
    }
  }, [orgaoId]);

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
    setSetorRequisitante("");
    setResponsaveis(RESPONSAVEIS_VAZIO);
  }
  function abrirEdicao(r: Rep) {
    setEditando(r);
    setCodigo(r.codigo);
    setNome(r.nome);
    setNumeroInteressado(r.numeroInteressado ?? "");
    setSetorRequisitante(r.setorRequisitante ?? "");
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
          setorRequisitante: setorRequisitante.trim() || null,
          orgaoId, // a unidade pertence ao órgão desta tela
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
    if (!confirm(`Excluir a unidade "${r.nome}"?`)) return;
    const resp = await fetch(`/api/admin/reparticoes/${r.id}`, { method: "DELETE" });
    if (!resp.ok) {
      const j = (await resp.json().catch(() => ({}))) as { error?: string };
      setErro(j.error ?? "Não foi possível excluir.");
      return;
    }
    await carregar();
  }

  async function persistirOrdem(ids: number[]) {
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

  /** Move a unidade uma posição p/ cima/baixo e persiste a nova ordem. */
  function mover(id: number, dir: -1 | 1) {
    if (!lista) return;
    const idx = lista.findIndex((x) => x.id === id);
    const alvo = idx + dir;
    if (idx < 0 || alvo < 0 || alvo >= lista.length) return;
    const nova = [...lista];
    [nova[idx], nova[alvo]] = [nova[alvo], nova[idx]];
    setLista(nova);
    persistirOrdem(nova.map((x) => x.id));
  }

  if (lista === null) {
    return (
      <div className="rounded-card border border-border p-4">
        <SkeletonLinhas linhas={6} />
      </div>
    );
  }

  const posDe = new Map(lista.map((r, i) => [r.id, i]));

  const colunas: Column<Rep>[] = [
    { key: "pos", header: "#", filter: "none", minWidth: 40, render: (r) => <span className="tabular-nums text-faint">{(posDe.get(r.id) ?? 0) + 1}</span> },
    { key: "codigo", header: "Sigla", filter: "none", minWidth: 90, render: (r) => <Badge tone="violet">{r.codigo}</Badge> },
    { key: "nome", header: "Nome da unidade", filter: "none", minWidth: 220, render: (r) => <span className="font-medium text-text">{r.nome}</span> },
    {
      key: "numeroInteressado",
      header: "Nº interessado",
      filter: "none",
      minWidth: 110,
      render: (r) =>
        r.numeroInteressado ? (
          <span className="font-mono text-[12px] text-text-2">{r.numeroInteressado}</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: "setorRequisitante",
      header: "Setor Requisitante",
      filter: "none",
      minWidth: 180,
      render: (r) =>
        r.setorRequisitante ? (
          <span className="line-clamp-1 text-[12px] text-text-2" title={r.setorRequisitante}>{r.setorRequisitante}</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: "responsavel",
      header: "Responsável (DFDs)",
      filter: "none",
      minWidth: 170,
      render: (r) => {
        const vigs = responsaveisVigentes(r.responsaveis, hoje);
        if (vigs.length === 0) return <span className="text-faint">—</span>;
        const nomes = vigs.map((v) => v.resp.nome).join(", ");
        const temp = vigs.some((v) => v.tipo === "temporario");
        return (
          <span className="line-clamp-1 text-text-2" title={nomes}>
            {nomes}
            {temp && (
              <span className="ml-1.5 text-[10px] font-semibold uppercase" style={{ color: "var(--info)" }}>
                temp.
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "acoes",
      header: "Ações",
      filter: "none",
      align: "right",
      minWidth: 150,
      render: (r) => {
        const idx = posDe.get(r.id) ?? 0;
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" onClick={() => mover(r.id, -1)} disabled={idx === 0} aria-label="Mover para cima" icon={<IconArrowUp className="h-4 w-4" />} />
            <Button variant="ghost" onClick={() => mover(r.id, 1)} disabled={idx === lista.length - 1} aria-label="Mover para baixo" icon={<IconArrowDown className="h-4 w-4" />} />
            <Button variant="ghost" onClick={() => abrirEdicao(r)} aria-label="Editar" icon={<IconPencil className="h-4 w-4" />} />
            <Button variant="ghost" onClick={() => excluir(r)} aria-label="Excluir" style={{ color: "var(--danger)" }} icon={<IconTrash className="h-4 w-4" />} />
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <Button variant="ghost" onClick={() => router.push("/painel/orgaos")} icon={<IconChevronLeft className="h-4 w-4" />}>
          Órgãos
        </Button>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-text">{orgaoNome}</h1>
          <p className="text-sm text-muted">Unidades deste órgão. Use ↑/↓ para ordenar (salvo automaticamente).</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={recarregar} loading={recarregando} icon={<IconRefresh className="h-4 w-4" />}>
            Recarregar
          </Button>
          <Button onClick={abrirNovo} icon={<IconPlus className="h-[18px] w-[18px]" />}>
            Nova unidade
          </Button>
        </div>
      </div>

      {erro && <Callout kind="danger">{erro}</Callout>}

      {lista.length === 0 ? (
        <Callout kind="info">Nenhuma unidade neste órgão ainda. Clique em “Nova unidade” para cadastrar.</Callout>
      ) : (
        <DataTable columns={colunas} rows={lista} getKey={(r) => r.id} minWidth={900} />
      )}

      <Modal open={!!editando} onClose={() => setEditando(null)} titulo={editando === "novo" ? `Nova unidade · ${orgaoNome}` : "Editar unidade"}>
        <form onSubmit={salvar} className="space-y-4">
          <TextField label="Sigla (código)" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex.: AMAE" required />
          <TextField label="Nome da unidade" value={nome} onChange={(e) => setNome(e.target.value)} required />
          <TextField
            label="Número do interessado (identifica a unidade pelo Interessado do protocolo)"
            value={numeroInteressado}
            onChange={(e) => setNumeroInteressado(e.target.value)}
            placeholder="Ex.: 1008171"
          />
          <TextField
            label="Setor Requisitante (padrão para identificar o DFD)"
            value={setorRequisitante}
            onChange={(e) => setSetorRequisitante(e.target.value)}
            placeholder="Ex.: SMIR - SECRETARIA MUNICIPAL DE INFRAESTRUTURA RURAL"
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
