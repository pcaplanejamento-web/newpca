"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ehCodigoGeral } from "@/lib/escopo-unidades-core";
import { MAX_NOME_RBAC } from "@/lib/rbac-validation";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { Checkbox, SearchField, TextField } from "./Field";
import { selectCls } from "./formStyles";
import { IconPencil, IconPlus, IconTrash, IconUsers } from "./icons";
import { Modal } from "./Modal";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";
import { Selecao } from "./Selecao";

type Grupo = { id: number; nome: string; permissaoId: number | null; membros: number[]; reparticoes: number[] };
type PermOpt = { id: number; nome: string };
type Status = "ativo" | "pendente" | "inativo";
type UserOpt = { id: number; nome: string; email: string; status: Status };
type RepOpt = { id: number; codigo: string; nome: string; oculto: boolean };

/** Ordem alfabética do português (acentos e caixa no lugar certo — a do banco põe "Á" depois do "Z"). */
const COLLATOR = new Intl.Collator("pt-BR", { sensitivity: "base" });
const ehGeral = (r: RepOpt) => ehCodigoGeral(r.codigo);

async function lerJson<T>(r: Response): Promise<T & { ok?: boolean; error?: string }> {
  return (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
}

export function GruposAdmin() {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [perms, setPerms] = useState<PermOpt[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [repsDisp, setRepsDisp] = useState<RepOpt[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();

  const [editando, setEditando] = useState<Grupo | "novo" | null>(null);
  const [nome, setNome] = useState("");
  const [permissaoId, setPermissaoId] = useState<number | null>(null);
  const [membros, setMembros] = useState<Set<number>>(new Set());
  const [reps, setReps] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroModal, setErroModal] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch("/api/admin/grupos");
      const j = await lerJson<{ grupos?: Grupo[]; permissoes?: PermOpt[]; usuarios?: UserOpt[]; reparticoes?: RepOpt[] }>(r);
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar.");
      setGrupos([...(j.grupos ?? [])].sort((a, b) => COLLATOR.compare(a.nome, b.nome)));
      setPerms([...(j.permissoes ?? [])].sort((a, b) => COLLATOR.compare(a.nome, b.nome)));
      setUsers([...(j.usuarios ?? [])].sort((a, b) => COLLATOR.compare(a.nome, b.nome)));
      setRepsDisp(j.reparticoes ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setGrupos([]);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const nomePermissao = (id: number | null) => perms.find((p) => p.id === id)?.nome ?? "Sem permissão";
  const geral = useMemo(() => repsDisp.find(ehGeral) ?? null, [repsDisp]);

  function abrirNovo() {
    setEditando("novo");
    setNome("");
    // Nada pré-escolhido: a permissão decide as telas do grupo — o ADM escolhe de propósito.
    setPermissaoId(null);
    setMembros(new Set());
    setReps(new Set());
    setBusca("");
    setErroModal(null);
  }
  function abrirEdicao(g: Grupo) {
    setEditando(g);
    setNome(g.nome);
    setPermissaoId(g.permissaoId);
    setMembros(new Set(g.membros));
    setReps(new Set(g.reparticoes));
    setBusca("");
    setErroModal(null);
  }
  const alternar = (set: (f: (s: Set<number>) => Set<number>) => void, id: number) =>
    set((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const usuariosFiltrados = useMemo(() => {
    const casa = predicadoBusca(busca); // vários de uma vez com ":"
    return casa ? users.filter((u) => casa([u.nome, u.email])) : users;
  }, [users, busca]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErroModal(null);
    try {
      const novo = editando === "novo";
      const r = await fetch(novo ? "/api/admin/grupos" : `/api/admin/grupos/${(editando as Grupo).id}`, {
        method: novo ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, permissaoId, membros: [...membros], reparticoes: [...reps] }),
      });
      const j = await lerJson<object>(r);
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      setEditando(null);
      toast.success(novo ? `Grupo "${nome.trim()}" criado.` : `Grupo "${nome.trim()}" salvo.`);
      await carregar();
    } catch (err) {
      // O erro aparece DENTRO do modal (atrás dele ninguém o via).
      setErroModal(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(g: Grupo) {
    setExcluindo(g.id);
    try {
      // O IMPACTO antes de perguntar: a exclusão cascateia quadros de tarefas, pastas e modelos do grupo.
      const ri = await fetch(`/api/admin/grupos/${g.id}`);
      const ji = await lerJson<{ texto?: string }>(ri);
      if (!ri.ok || !ji.ok) throw new Error(ji.error ?? "Não foi possível conferir o grupo.");
      const sim = await confirmar({
        titulo: `Excluir o grupo "${g.nome}"?`,
        texto: ji.texto,
        confirmar: "Excluir grupo",
        perigo: true,
      });
      if (!sim) return;
      const r = await fetch(`/api/admin/grupos/${g.id}?confirmar=1`, { method: "DELETE" });
      const j = await lerJson<object>(r);
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao excluir.");
      toast.success(`Grupo "${g.nome}" excluído.`);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    } finally {
      setExcluindo(null);
    }
  }

  if (grupos === null) {
    return (
      <div className="rounded-card border border-border p-4">
        <SkeletonLinhas linhas={4} />
      </div>
    );
  }

  const unidadesDoCard = (g: Grupo) =>
    geral && g.reparticoes.includes(geral.id) ? "todas as unidades" : `${g.reparticoes.length} unidade(s)`;
  const semPermissao = permissaoId == null;

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          O grupo reúne pessoas, a PERMISSÃO (quais telas elas acessam) e as UNIDADES (de quais unidades veem os dados).
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
            <div key={g.id} className="rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
              <div className="flex items-center gap-2.5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">
                  <IconUsers className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-bold text-text">{g.nome}</h3>
                  <p className={`truncate text-[12px] ${g.permissaoId == null ? "text-[var(--warn)]" : "text-muted"}`}>
                    {nomePermissao(g.permissaoId)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[12px] text-faint">
                {g.membros.length} pessoa(s) · {unidadesDoCard(g)}
              </p>
              <div className="mt-3 flex justify-end gap-1.5">
                <Button variant="ghost" onClick={() => abrirEdicao(g)} icon={<IconPencil className="h-3.5 w-3.5" />}>
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => excluir(g)}
                  loading={excluindo === g.id}
                  style={{ color: "var(--danger)" }}
                  icon={<IconTrash className="h-3.5 w-3.5" />}
                >
                  Excluir
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editando} onClose={() => setEditando(null)} titulo={editando === "novo" ? "Novo grupo" : "Editar grupo"} size="lg">
        <form onSubmit={salvar} className="space-y-[var(--gap-block)]">
          {erroModal && <Callout kind="danger">{erroModal}</Callout>}
          <TextField label="Nome do grupo" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={MAX_NOME_RBAC} required />
          <div>
            <label htmlFor="grupo-permissao" className="mb-2 block text-[13.5px] font-bold text-text">
              Permissão do grupo
            </label>
            <Selecao
              id="grupo-permissao"
              value={permissaoId ?? ""}
              onChange={(e) => setPermissaoId(e.target.value ? Number(e.target.value) : null)}
              className={`${selectCls} w-full`}
            >
              <option value="">Sem permissão</option>
              {perms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Selecao>
            {semPermissao && (
              <p className="mt-1.5 text-[12px] text-[var(--warn)]">Sem permissão, as pessoas do grupo não veem nenhuma tela.</p>
            )}
          </div>
          <div>
            <span className="mb-2 block text-[13.5px] font-bold text-text">
              Unidades do grupo · {reps.size} selecionada(s)
            </span>
            {repsDisp.length === 0 ? (
              <p className="rounded-control border border-dashed border-border-2 p-3 text-[12px] text-faint">
                Nenhuma unidade cadastrada. Cadastre em Órgãos e Unidades.
              </p>
            ) : (
              <div className="max-h-[200px] space-y-1 overflow-y-auto rounded-control border border-border p-2">
                {repsDisp.map((r) => (
                  <div key={r.id} className="rounded-control p-1.5 hover:bg-surface-2">
                    <Checkbox
                      checked={reps.has(r.id)}
                      onChange={() => alternar(setReps, r.id)}
                      label={
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[10.5px] text-faint">{r.codigo}</span>
                          <span className="min-w-0 truncate text-[13px] text-text">{r.nome}</span>
                          {ehGeral(r) && <Badge tone="blue">Todas as unidades</Badge>}
                          {r.oculto && <Badge tone="slate">Oculta</Badge>}
                        </span>
                      }
                    />
                  </div>
                ))}
              </div>
            )}
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
                    onChange={() => alternar(setMembros, u.id)}
                    label={
                      <span className="flex items-center gap-2.5">
                        <Avatar nome={u.nome} size="sm" />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-medium text-text">{u.nome}</span>
                            {u.status === "pendente" && <Badge tone="amber">Pendente</Badge>}
                            {u.status === "inativo" && <Badge tone="slate">Inativo</Badge>}
                          </span>
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
      {confirmacao}
    </div>
  );
}
