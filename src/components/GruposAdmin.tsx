"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { Checkbox, SearchField, TextField } from "./Field";
import { selectCls } from "./formStyles";
import { IconPencil, IconPlus, IconTrash, IconUsers } from "./icons";
import { Modal } from "./Modal";
import { SkeletonLinhas } from "./Skeleton";

type Grupo = { id: number; nome: string; permissaoId: number | null; membros: number[] };
type PermOpt = { id: number; nome: string };
type UserOpt = { id: number; nome: string; email: string };

export function GruposAdmin() {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [perms, setPerms] = useState<PermOpt[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const [editando, setEditando] = useState<Grupo | "novo" | null>(null);
  const [nome, setNome] = useState("");
  const [permissaoId, setPermissaoId] = useState<number | null>(null);
  const [membros, setMembros] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch("/api/admin/grupos");
      const j = (await r.json()) as {
        ok?: boolean;
        error?: string;
        grupos?: Grupo[];
        permissoes?: PermOpt[];
        usuarios?: UserOpt[];
      };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar.");
      setGrupos(j.grupos ?? []);
      setPerms(j.permissoes ?? []);
      setUsers(j.usuarios ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setGrupos([]);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const nomePermissao = (id: number | null) => perms.find((p) => p.id === id)?.nome ?? "Sem permissão";

  function abrirNovo() {
    setEditando("novo");
    setNome("");
    setPermissaoId(perms[0]?.id ?? null);
    setMembros(new Set());
    setBusca("");
  }
  function abrirEdicao(g: Grupo) {
    setEditando(g);
    setNome(g.nome);
    setPermissaoId(g.permissaoId);
    setMembros(new Set(g.membros));
    setBusca("");
  }
  const toggleMembro = (id: number) =>
    setMembros((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const usuariosFiltrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return users;
    return users.filter((u) => u.nome.toLowerCase().includes(t) || u.email.toLowerCase().includes(t));
  }, [users, busca]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const novo = editando === "novo";
      const r = await fetch(novo ? "/api/admin/grupos" : `/api/admin/grupos/${(editando as Grupo).id}`, {
        method: novo ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, permissaoId, membros: [...membros] }),
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

  async function excluir(g: Grupo) {
    if (!confirm(`Excluir o grupo "${g.nome}"? Os dados do grupo (protocolos) ficam sem grupo.`)) return;
    await fetch(`/api/admin/grupos/${g.id}`, { method: "DELETE" });
    await carregar();
  }

  if (grupos === null) {
    return (
      <div className="rounded-card border border-border p-4">
        <SkeletonLinhas linhas={4} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Crie grupos, escolha a permissão e vincule pessoas. Membros do grupo compartilham permissão e dados.
        </p>
        <Button onClick={abrirNovo} icon={<IconPlus className="h-[18px] w-[18px]" />}>
          Novo grupo
        </Button>
      </div>

      {erro && <Callout kind="danger">{erro}</Callout>}

      {grupos.length === 0 ? (
        <div className="rounded-card border border-dashed border-border-2 p-10 text-center text-sm text-muted">
          Nenhum grupo criado ainda.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {grupos.map((g) => (
            <div key={g.id} className="rounded-card border border-border bg-surface p-4 shadow-ring">
              <div className="flex items-center gap-2.5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">
                  <IconUsers className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-bold text-text">{g.nome}</h3>
                  <p className="truncate text-[12px] text-muted">{nomePermissao(g.permissaoId)}</p>
                </div>
              </div>
              <p className="mt-3 text-[12px] text-faint">{g.membros.length} pessoa(s)</p>
              <div className="mt-3 flex justify-end gap-1.5">
                <Button variant="ghost" onClick={() => abrirEdicao(g)} icon={<IconPencil className="h-3.5 w-3.5" />}>
                  Editar
                </Button>
                <Button variant="ghost" onClick={() => excluir(g)} style={{ color: "var(--danger)" }} icon={<IconTrash className="h-3.5 w-3.5" />}>
                  Excluir
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editando} onClose={() => setEditando(null)} titulo={editando === "novo" ? "Novo grupo" : "Editar grupo"} size="lg" scrollable>
        <form onSubmit={salvar} className="space-y-4">
          <TextField label="Nome do grupo" value={nome} onChange={(e) => setNome(e.target.value)} required />
          <div>
            <span className="mb-2 block text-[13.5px] font-bold text-text">Permissão do grupo</span>
            <select
              value={permissaoId ?? ""}
              onChange={(e) => setPermissaoId(e.target.value ? Number(e.target.value) : null)}
              className={`${selectCls} w-full`}
              aria-label="Permissão do grupo"
            >
              <option value="">Sem permissão</option>
              {perms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="mb-2 block text-[13.5px] font-bold text-text">
              Pessoas do grupo · {membros.size} selecionada(s)
            </span>
            <SearchField value={busca} onChange={(e) => setBusca(e.target.value)} onClear={() => setBusca("")} placeholder="Buscar pessoa..." />
            <div className="mt-2 max-h-[280px] space-y-1 overflow-y-auto rounded-control border border-border p-2">
              {usuariosFiltrados.map((u) => (
                <div key={u.id} className="rounded-control p-1.5 hover:bg-surface-2">
                  <Checkbox
                    checked={membros.has(u.id)}
                    onChange={() => toggleMembro(u.id)}
                    label={
                      <span className="flex items-center gap-2.5">
                        <Avatar nome={u.nome} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-text">{u.nome}</span>
                          <span className="block truncate text-[11px] text-muted">{u.email}</span>
                        </span>
                      </span>
                    }
                  />
                </div>
              ))}
              {usuariosFiltrados.length === 0 && (
                <p className="p-2 text-center text-[12px] text-faint">Nenhuma pessoa encontrada.</p>
              )}
            </div>
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
