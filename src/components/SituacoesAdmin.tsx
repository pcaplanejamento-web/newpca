"use client";

import { useCallback, useEffect, useState } from "react";
import type { SituacaoComUso } from "@/lib/situacoes";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { ColorField } from "./ColorField";
import { type Column, DataTable } from "./DataTable";
import { EstadoPonto } from "./EstadoCelula";
import { TextField } from "./Field";
import { IconArrowDown, IconArrowUp, IconPencil, IconPlus, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";

const COR_PADRAO = "#2563eb";

/**
 * SITUAÇÕES do protocolo (Configurações → Situações) — as ÚNICAS que a coluna "Situação" da Mesa usa:
 * cadastrar (nome + cor), editar, ordenar (↑/↓ = a ordem do dropdown) e excluir (os protocolos que a
 * usavam ficam sem situação — o aviso diz quantos). Só componentes do design-system.
 */
export function SituacoesAdmin() {
  const [lista, setLista] = useState<SituacaoComUso[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<SituacaoComUso | "nova" | null>(null);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(COR_PADRAO);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/situacoes");
      const j = (await r.json()) as { ok?: boolean; error?: string; situacoes?: SituacaoComUso[] };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar as situações.");
      setLista(j.situacoes ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar as situações.");
      setLista([]);
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrir(s: SituacaoComUso | "nova") {
    setEditando(s);
    setNome(s === "nova" ? "" : s.nome);
    setCor(s === "nova" ? COR_PADRAO : s.cor);
  }

  async function salvar() {
    if (!editando) return;
    if (!nome.trim()) {
      toast.error("Informe o nome da situação.");
      return;
    }
    const nova = editando === "nova";
    setSalvando(true);
    try {
      const r = await fetch(nova ? "/api/admin/situacoes" : `/api/admin/situacoes/${editando.id}`, {
        method: nova ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), cor }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar a situação.");
      toast.success(nova ? "Situação cadastrada." : "Situação atualizada.");
      setEditando(null);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar a situação.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(s: SituacaoComUso) {
    const aviso =
      s.emUso > 0
        ? `Excluir a situação "${s.nome}"? ${s.emUso} protocolo(s) estão nela e ficarão SEM situação.`
        : `Excluir a situação "${s.nome}"?`;
    if (!confirm(aviso)) return;
    try {
      const r = await fetch(`/api/admin/situacoes/${s.id}`, { method: "DELETE" });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao excluir.");
      toast.success("Situação excluída.");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  async function mover(id: number, dir: -1 | 1) {
    if (!lista) return;
    const i = lista.findIndex((x) => x.id === id);
    const alvo = i + dir;
    if (i < 0 || alvo < 0 || alvo >= lista.length) return;
    const nova = [...lista];
    [nova[i], nova[alvo]] = [nova[alvo], nova[i]];
    setLista(nova);
    try {
      const r = await fetch("/api/admin/situacoes/ordem", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: nova.map((x) => x.id) }),
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
        <SkeletonLinhas linhas={3} />
      </div>
    );
  }
  const pos = new Map(lista.map((s, i) => [s.id, i]));
  const cols: Column<SituacaoComUso>[] = [
    { key: "pos", header: "#", filter: "none", nowrap: true, render: (s) => <span className="tabular-nums text-faint">{(pos.get(s.id) ?? 0) + 1}</span> },
    { key: "nome", header: "Situação", filter: "none", align: "left", minWidth: 200, render: (s) => <EstadoPonto rotulo={s.nome} cor={s.cor} /> },
    { key: "uso", header: "Protocolos", filter: "none", nowrap: true, render: (s) => <span className="tabular-nums">{s.emUso}</span> },
    {
      key: "acoes",
      header: "",
      filter: "none",
      align: "right",
      nowrap: true,
      render: (s) => {
        const i = pos.get(s.id) ?? 0;
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" onClick={() => mover(s.id, -1)} disabled={i === 0} aria-label="Mover para cima" icon={<IconArrowUp className="h-4 w-4" />} />
            <Button variant="ghost" onClick={() => mover(s.id, 1)} disabled={i === lista.length - 1} aria-label="Mover para baixo" icon={<IconArrowDown className="h-4 w-4" />} />
            <Button variant="ghost" onClick={() => abrir(s)} aria-label="Editar situação" icon={<IconPencil className="h-4 w-4" />} />
            <Button variant="ghost" onClick={() => excluir(s)} aria-label="Excluir situação" style={{ color: "var(--danger)" }} icon={<IconTrash className="h-4 w-4" />} />
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {erro && (
        <AvisoFlutuante kind="danger" titulo="Situações" onClose={() => setErro(null)}>
          {erro}
        </AvisoFlutuante>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          As situações que a coluna <strong className="text-text-2">Situação</strong> dos protocolos (Mesa) oferece — só as
          cadastradas aqui. Use ↑/↓ para a ordem do dropdown.
        </p>
        <Button onClick={() => abrir("nova")} icon={<IconPlus className="h-4 w-4" />}>
          Nova situação
        </Button>
      </div>
      {lista.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
          Nenhuma situação cadastrada — a coluna Situação da Mesa fica vazia até você cadastrar a primeira.
        </p>
      ) : (
        <DataTable columns={cols} rows={lista} getKey={(s) => s.id} pageSize={20} minWidth={520} resumo={(l) => `${l.length} situaç${l.length === 1 ? "ão" : "ões"}`} />
      )}

      <Modal
        open={editando !== null}
        onClose={() => setEditando(null)}
        titulo={editando === "nova" ? "Nova situação" : "Editar situação"}
        size="md"
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditando(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvar} loading={salvando}>
              {editando === "nova" ? "Cadastrar" : "Salvar"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <TextField label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Em análise" maxLength={60} />
          <ColorField label="Cor" value={cor} onChange={setCor} />
          <div className="rounded-card border border-border bg-surface-2 p-3">
            <p className="mb-1.5 text-[12px] font-semibold text-muted">Prévia</p>
            <EstadoPonto rotulo={nome.trim() || "Situação"} cor={cor} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
