"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ABAS } from "@/lib/abas";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { Checkbox, TextField } from "./Field";
import { IconPencil, IconPlus, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { SkeletonLinhas } from "./Skeleton";

type Perm = { id: number; nome: string; abas: string[]; grupos: number };

const labelAba = (k: string) => ABAS.find((a) => a.key === k)?.label ?? k;

export function PermissoesAdmin() {
  const [lista, setLista] = useState<Perm[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Perm | "novo" | null>(null);
  const [nome, setNome] = useState("");
  const [abas, setAbas] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch("/api/admin/permissoes");
      const j = (await r.json()) as { ok?: boolean; error?: string; permissoes?: Perm[] };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar.");
      setLista(j.permissoes ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setLista([]);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    setEditando("novo");
    setNome("");
    setAbas([]);
  }
  function abrirEdicao(p: Perm) {
    setEditando(p);
    setNome(p.nome);
    setAbas(p.abas);
  }
  const toggleAba = (k: string) =>
    setAbas((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const novo = editando === "novo";
      const r = await fetch(novo ? "/api/admin/permissoes" : `/api/admin/permissoes/${(editando as Perm).id}`, {
        method: novo ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, abas }),
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

  async function excluir(p: Perm) {
    if (!confirm(`Excluir a permissão "${p.nome}"? Os grupos ficarão sem permissão.`)) return;
    await fetch(`/api/admin/permissoes/${p.id}`, { method: "DELETE" });
    await carregar();
  }

  if (lista === null) {
    return (
      <div className="rounded-card border border-border p-4">
        <SkeletonLinhas linhas={4} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Defina quais abas cada permissão libera. Os grupos apontam para uma permissão.</p>
        <Button onClick={abrirNovo} icon={<IconPlus className="h-[18px] w-[18px]" />}>
          Nova permissão
        </Button>
      </div>

      {erro && <Callout kind="danger">{erro}</Callout>}

      {lista.length === 0 ? (
        <div className="rounded-card border border-dashed border-border-2 p-10 text-center text-sm text-muted">
          Nenhuma permissão criada ainda.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((p) => (
            <div key={p.id} className="rounded-card border border-border bg-surface p-4 shadow-ring">
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 truncate font-bold text-text">{p.nome}</h3>
                <span className="shrink-0 text-[11px] text-faint">{p.grupos} grupo(s)</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.abas.length ? (
                  p.abas.map((k) => (
                    <Badge key={k} tone="blue">
                      {labelAba(k)}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-faint">Nenhuma aba liberada</span>
                )}
              </div>
              <div className="mt-4 flex justify-end gap-1.5">
                <Button variant="ghost" onClick={() => abrirEdicao(p)} icon={<IconPencil className="h-3.5 w-3.5" />}>
                  Editar
                </Button>
                <Button variant="ghost" onClick={() => excluir(p)} style={{ color: "var(--danger)" }} icon={<IconTrash className="h-3.5 w-3.5" />}>
                  Excluir
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editando} onClose={() => setEditando(null)} titulo={editando === "novo" ? "Nova permissão" : "Editar permissão"}>
        <form onSubmit={salvar} className="space-y-4">
          <TextField label="Nome da permissão" value={nome} onChange={(e) => setNome(e.target.value)} required />
          <div>
            <span className="mb-2 block text-[13.5px] font-bold text-text">Abas disponíveis</span>
            <div className="space-y-2.5">
              {ABAS.map((a) => (
                <Checkbox key={a.key} label={a.label} checked={abas.includes(a.key)} onChange={() => toggleAba(a.key)} />
              ))}
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
