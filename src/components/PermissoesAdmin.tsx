"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ABAS } from "@/lib/abas";
import { MAX_NOME_RBAC } from "@/lib/rbac-validation";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { Checkbox, TextField } from "./Field";
import { IconPencil, IconPlus, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";

type Perm = { id: number; nome: string; abas: string[]; grupos: number };

const labelAba = (k: string) => ABAS.find((a) => a.key === k)?.label ?? k;
/** Ordem alfabética do português (acentos e caixa no lugar certo). */
const COLLATOR = new Intl.Collator("pt-BR", { sensitivity: "base" });
/** As abas na ORDEM da navegação (a ordem do clique não importa). */
const naOrdem = (abas: string[]) => ABAS.map((a) => a.key).filter((k) => abas.includes(k));

export function PermissoesAdmin() {
  const [lista, setLista] = useState<Perm[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Perm | "novo" | null>(null);
  const [nome, setNome] = useState("");
  const [abas, setAbas] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erroModal, setErroModal] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch("/api/admin/permissoes");
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; permissoes?: Perm[] };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar.");
      setLista([...(j.permissoes ?? [])].sort((a, b) => COLLATOR.compare(a.nome, b.nome)));
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
    setErroModal(null);
  }
  function abrirEdicao(p: Perm) {
    setEditando(p);
    setNome(p.nome);
    setAbas(p.abas);
    setErroModal(null);
  }
  const toggleAba = (k: string) => setAbas((a) => naOrdem(a.includes(k) ? a.filter((x) => x !== k) : [...a, k]));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErroModal(null);
    try {
      const novo = editando === "novo";
      const r = await fetch(novo ? "/api/admin/permissoes" : `/api/admin/permissoes/${(editando as Perm).id}`, {
        method: novo ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, abas }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      setEditando(null);
      toast.success(novo ? `Permissão "${nome.trim()}" criada.` : `Permissão "${nome.trim()}" salva.`);
      await carregar();
    } catch (e) {
      // O erro aparece DENTRO do modal (atrás dele ninguém o via).
      setErroModal(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(p: Perm) {
    const sim = await confirmar({
      titulo: `Excluir a permissão "${p.nome}"?`,
      texto: p.grupos
        ? `${p.grupos} grupo(s) ficarão sem permissão — as pessoas deles deixam de ver as telas até o grupo receber outra.`
        : "Nenhum grupo usa esta permissão.",
      confirmar: "Excluir permissão",
      perigo: p.grupos > 0,
    });
    if (!sim) return;
    setExcluindo(p.id);
    try {
      const r = await fetch(`/api/admin/permissoes/${p.id}`, { method: "DELETE" });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao excluir.");
      toast.success(`Permissão "${p.nome}" excluída.`);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir.");
    } finally {
      setExcluindo(null);
    }
  }

  if (lista === null) {
    return (
      <div className="rounded-card border border-border p-4">
        <SkeletonLinhas linhas={4} />
      </div>
    );
  }

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          A permissão define QUAIS telas (módulos) as pessoas de um grupo acessam. Cada grupo aponta para uma permissão.
        </p>
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
            <div key={p.id} className="rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
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
                <Button
                  variant="ghost"
                  onClick={() => excluir(p)}
                  loading={excluindo === p.id}
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

      <Modal open={!!editando} onClose={() => setEditando(null)} titulo={editando === "novo" ? "Nova permissão" : "Editar permissão"}>
        <form onSubmit={salvar} className="space-y-[var(--gap-block)]">
          {erroModal && <Callout kind="danger">{erroModal}</Callout>}
          <TextField label="Nome da permissão" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={MAX_NOME_RBAC} required />
          <div>
            <span className="mb-2 block text-[13.5px] font-bold text-text">Telas liberadas</span>
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
      {confirmacao}
    </div>
  );
}
