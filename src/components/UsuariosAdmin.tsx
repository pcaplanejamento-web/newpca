"use client";

import { useCallback, useEffect, useState } from "react";
import { dataBR } from "@/lib/format";
import { Avatar } from "./Avatar";
import { Badge, type Tone } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { inputCls, labelCls, selectCls } from "./formStyles";
import { IconAlert, IconCheck, IconPencil, IconSave, IconSpinner } from "./icons";
import { Modal } from "./Modal";
import { SkeletonLinhas } from "./Skeleton";

type Role = "admin" | "gestor" | "membro";
type Status = "ativo" | "pendente" | "inativo";
type U = {
  id: number;
  nome: string;
  email: string;
  matricula: string | null;
  foto: string | null;
  role: Role;
  status: Status;
  criadoEm: string | null;
};

const STATUS_TONE: Record<Status, Tone> = { ativo: "emerald", pendente: "amber", inativo: "slate" };
const STATUS_LABEL: Record<Status, string> = { ativo: "Ativo", pendente: "Pendente", inativo: "Inativo" };
const ROLE_LABEL: Record<Role, string> = { admin: "Administrador", gestor: "Gestor", membro: "Membro" };

export function UsuariosAdmin({ meuId }: { meuId: number }) {
  const [lista, setLista] = useState<U[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editando, setEditando] = useState<U | null>(null);
  const [edNome, setEdNome] = useState("");
  const [edEmail, setEdEmail] = useState("");
  const [edMatricula, setEdMatricula] = useState("");
  const [salvandoEd, setSalvandoEd] = useState(false);
  const [erroEd, setErroEd] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch("/api/admin/usuarios");
      const j = (await r.json()) as { ok?: boolean; error?: string; usuarios?: U[] };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar usuários.");
      setLista(j.usuarios ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setLista([]);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function acao(id: number, init: RequestInit) {
    setBusyId(id);
    setErro(null);
    try {
      const r = await fetch(`/api/admin/usuarios/${id}`, init);
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro na operação.");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro na operação.");
    } finally {
      setBusyId(null);
    }
  }

  const patch = (id: number, dados: { role?: Role; status?: Status }) =>
    acao(id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });

  const excluir = (id: number) => {
    if (confirm("Excluir este usuário? Esta ação não pode ser desfeita.")) {
      acao(id, { method: "DELETE" });
    }
  };

  function abrirEdicao(u: U) {
    setEditando(u);
    setEdNome(u.nome);
    setEdEmail(u.email);
    setEdMatricula(u.matricula ?? "");
    setErroEd(null);
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    if (!editando) return;
    setSalvandoEd(true);
    setErroEd(null);
    try {
      const r = await fetch(`/api/admin/usuarios/${editando.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: edNome, email: edEmail, matricula: edMatricula }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      setEditando(null);
      await carregar();
    } catch (err) {
      setErroEd(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvandoEd(false);
    }
  }

  if (lista === null) {
    return (
      <div className="rounded-card border border-border p-4">
        <SkeletonLinhas linhas={6} />
      </div>
    );
  }

  const pendentes = lista.filter((u) => u.status === "pendente").length;

  const colunas: Column<U>[] = [
    {
      key: "usuario",
      header: "Usuário",
      minWidth: 240,
      filter: "none",
      value: (u) => u.nome,
      render: (u) => (
        <div className="flex items-center gap-2.5">
          <Avatar nome={u.nome} foto={u.foto} />
          <div className="min-w-0">
            <div className="font-medium text-text">
              {u.nome} {u.id === meuId && <span className="text-faint">(você)</span>}
            </div>
            <div className="text-xs text-muted">{u.email}</div>
            {u.matricula && <div className="text-[11px] text-faint">Matrícula {u.matricula}</div>}
            {u.criadoEm && <div className="text-[11px] text-faint">desde {dataBR(u.criadoEm)}</div>}
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Papel",
      minWidth: 150,
      value: (u) => ROLE_LABEL[u.role],
      render: (u) => (
        <select
          value={u.role}
          disabled={u.id === meuId || busyId === u.id}
          onChange={(e) => patch(u.id, { role: e.target.value as Role })}
          className={selectCls}
          aria-label="Papel do usuário"
        >
          <option value="admin">Administrador</option>
          <option value="gestor">Gestor</option>
          <option value="membro">Membro</option>
        </select>
      ),
    },
    {
      key: "status",
      header: "Status",
      minWidth: 120,
      value: (u) => STATUS_LABEL[u.status],
      render: (u) => <Badge tone={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>,
    },
    {
      key: "acoes",
      header: "Ações",
      align: "right",
      minWidth: 220,
      filter: "none",
      render: (u) => {
        const souEu = u.id === meuId;
        const busy = busyId === u.id;
        return (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {busy && <IconSpinner className="h-4 w-4 text-faint" />}
            <Button variant="secondary" disabled={busy} onClick={() => abrirEdicao(u)} icon={<IconPencil className="h-3.5 w-3.5" />}>
              Editar
            </Button>
            {u.status === "pendente" && (
              <Button disabled={busy} onClick={() => patch(u.id, { status: "ativo" })} icon={<IconCheck className="h-3.5 w-3.5" />}>
                Aprovar
              </Button>
            )}
            {u.status === "ativo" && !souEu && (
              <Button variant="secondary" disabled={busy} onClick={() => patch(u.id, { status: "inativo" })}>
                Desativar
              </Button>
            )}
            {u.status === "inativo" && (
              <Button variant="secondary" disabled={busy} onClick={() => patch(u.id, { status: "ativo" })}>
                Reativar
              </Button>
            )}
            {!souEu && (
              <Button variant="danger" disabled={busy} onClick={() => excluir(u.id)}>
                Excluir
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {pendentes > 0 && (
        <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />}>
          {pendentes} cadastro(s) aguardando sua aprovação.
        </Callout>
      )}
      {erro && <Callout kind="danger">{erro}</Callout>}

      <DataTable columns={colunas} rows={lista} getKey={(u) => u.id} pageSize={12} minWidth={720} />

      {/* Modal: editar dados do usuário */}
      <Modal open={!!editando} onClose={() => setEditando(null)} titulo="Editar usuário">
        <form onSubmit={salvarEdicao}>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Nome completo</label>
              <input className={inputCls} value={edNome} onChange={(e) => setEdNome(e.target.value)} required />
            </div>
            <div>
              <label className={labelCls}>E-mail</label>
              <input type="email" className={inputCls} value={edEmail} onChange={(e) => setEdEmail(e.target.value)} required />
            </div>
            <div>
              <label className={labelCls}>Matrícula</label>
              <input className={inputCls} value={edMatricula} onChange={(e) => setEdMatricula(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          {erroEd && (
            <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />} className="mt-3">
              {erroEd}
            </Callout>
          )}
          <div className="mt-4 flex gap-2">
            <Button type="submit" loading={salvandoEd} icon={<IconSave className="h-[18px] w-[18px]" />} className="flex-1">
              Salvar
            </Button>
            <Button variant="secondary" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
