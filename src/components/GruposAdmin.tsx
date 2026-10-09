"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ABAS } from "@/lib/abas";
import { ehCodigoGeral } from "@/lib/escopo-unidades-core";
import { MAX_NOME_RBAC } from "@/lib/rbac-validation";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { Checkbox, SearchField, TextField } from "./Field";
import { IconPlus, IconSave, IconTrash, IconUsers } from "./icons";
import { Modal } from "./Modal";
import { NAV_MODULOS } from "./navModulos";
import { CartaoEspaco } from "./QuadroCard";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";
import { Switch } from "./Switch";

type Grupo = { id: number; nome: string; abas: string[]; pcas: number[] | null; membros: number[]; reparticoes: number[] };
type PcaOpt = { id: number; nome: string; ano: number | null };
type Status = "ativo" | "pendente" | "inativo";
type UserOpt = { id: number; nome: string; email: string; status: Status };
type RepOpt = { id: number; codigo: string; nome: string; oculto: boolean };

/** Ordem alfabética do português (acentos e caixa no lugar certo — a do banco põe "Á" depois do "Z"). */
const COLLATOR = new Intl.Collator("pt-BR", { sensitivity: "base" });
const ehGeral = (r: RepOpt) => ehCodigoGeral(r.codigo);
/** As telas do grupo por nome, na ordem do menu. */
/** O formulário do banner (o Salvar fica no rodapé fixo do banner, fora do form). */
const FORM_ID = "form-grupo";

async function lerJson<T>(r: Response): Promise<T & { ok?: boolean; error?: string }> {
  return (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
}

export function GruposAdmin() {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [pcasDisp, setPcasDisp] = useState<PcaOpt[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [repsDisp, setRepsDisp] = useState<RepOpt[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();

  const [editando, setEditando] = useState<Grupo | "novo" | null>(null);
  const [nome, setNome] = useState("");
  const [abas, setAbas] = useState<Set<string>>(new Set());
  // null = TODOS os PCAs (sem restrição); o conjunto = só esses.
  const [pcasSel, setPcasSel] = useState<Set<number> | null>(null);
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
      const j = await lerJson<{ grupos?: Grupo[]; pcas?: PcaOpt[]; usuarios?: UserOpt[]; reparticoes?: RepOpt[] }>(r);
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar.");
      setGrupos([...(j.grupos ?? [])].sort((a, b) => COLLATOR.compare(a.nome, b.nome)));
      setPcasDisp(j.pcas ?? []);
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

  const geral = useMemo(() => repsDisp.find(ehGeral) ?? null, [repsDisp]);

  function abrirNovo() {
    setEditando("novo");
    setNome("");
    // Nenhuma tela pré-escolhida (o ADM escolhe de propósito); os PCAs começam em "todos".
    setAbas(new Set());
    setPcasSel(null);
    setMembros(new Set());
    setReps(new Set());
    setBusca("");
    setErroModal(null);
  }
  function abrirEdicao(g: Grupo) {
    setEditando(g);
    setNome(g.nome);
    setAbas(new Set(g.abas));
    setPcasSel(g.pcas == null ? null : new Set(g.pcas));
    setMembros(new Set(g.membros));
    setReps(new Set(g.reparticoes));
    setBusca("");
    setErroModal(null);
  }
  const alternar = <T,>(set: (f: (s: Set<T>) => Set<T>) => void, id: T) =>
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
        body: JSON.stringify({ nome, abas: [...abas], pcas: pcasSel == null ? null : [...pcasSel], membros: [...membros], reparticoes: [...reps] }),
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
      <div className="rounded-card border border-border p-[var(--pad-card)]">
        <SkeletonLinhas linhas={4} />
      </div>
    );
  }


  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          O grupo reúne pessoas, as TELAS que elas abrem (o papel diz o que fazem nelas), os PCAs e as UNIDADES (de quais
          unidades veem os dados).
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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-[var(--gap-block)]">
          {grupos.map((g) => {
            const telas = NAV_MODULOS.filter((m) => g.abas.includes(m.aba));
            return (
              <CartaoEspaco
                key={g.id}
                ariaLabel={`Editar o grupo ${g.nome}`}
                onClick={() => abrirEdicao(g)}
                sobretitulo={`Grupo · ${telas.length} tela(s)`}
                selo={telas.length === 0 ? <Badge tone="amber">Sem telas</Badge> : undefined}
                nome={g.nome}
                capa={
                  <div className="relative grid aspect-video w-full place-items-center overflow-hidden rounded-lg bg-accent-soft" title={telas.map((t) => t.label).join(", ") || "Nenhuma tela"}>
                    {telas.length ? (
                      <div className="flex max-w-[70%] flex-wrap justify-center gap-1.5">
                        {telas.map((t) => (
                          <span key={t.aba} className="grid h-8 w-8 place-items-center rounded-control bg-surface text-accent shadow-ring">
                            <t.Icon className="h-4 w-4" />
                          </span>
                        ))}
                      </div>
                    ) : (
                      <IconUsers className="h-8 w-8 text-accent/60" />
                    )}
                  </div>
                }
                metricas={[
                  { rotulo: "Pessoas", valor: String(g.membros.length) },
                  { rotulo: "Unidades", valor: geral && g.reparticoes.includes(geral.id) ? "Todas" : String(g.reparticoes.length) },
                  { rotulo: "PCAs", valor: g.pcas == null ? "Todos" : String(g.pcas.length) },
                ]}
                canto={
                  <span className="absolute top-3.5 right-3.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => excluir(g)}
                      loading={excluindo === g.id}
                      aria-label={`Excluir o grupo ${g.nome}`}
                      title="Excluir o grupo"
                      style={{ color: "var(--danger)" }}
                      icon={<IconTrash className="h-3.5 w-3.5" />}
                    />
                  </span>
                }
              />
            );
          })}
        </div>
      )}

      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        titulo={editando === "novo" ? "Novo grupo" : "Editar grupo"}
        size="lg"
        bloqueado={salvando}
        rodape={
          <div className="flex justify-end">
            <Button type="submit" form={FORM_ID} loading={salvando} icon={<IconSave className="h-4 w-4" />}>
              Salvar
            </Button>
          </div>
        }
      >
        <form id={FORM_ID} onSubmit={salvar} className="space-y-[var(--gap-block)]">
          {erroModal && <Callout kind="danger">{erroModal}</Callout>}
          <TextField label="Nome do grupo" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={MAX_NOME_RBAC} required />
          <fieldset>
            <legend className="mb-2 block text-[13.5px] font-bold text-text">Telas do grupo · {abas.size} selecionada(s)</legend>
            <div className="grid gap-1 rounded-control border border-border p-2 sm:grid-cols-2">
              {ABAS.map((a) => (
                <div key={a.key} className="rounded-control p-1.5 hover:bg-surface-2">
                  <Checkbox label={a.label} checked={abas.has(a.key)} onChange={() => alternar(setAbas, a.key)} />
                </div>
              ))}
            </div>
            {abas.size === 0 ? (
              <p className="mt-1.5 text-[12px] text-[var(--warn)]">Sem nenhuma tela, as pessoas do grupo não veem os módulos.</p>
            ) : (
              <p className="mt-1.5 text-[12px] text-muted">O papel de cada pessoa diz o que ela faz nessas telas. As telas da Administração são só do ADM.</p>
            )}
          </fieldset>
          <fieldset>
            <legend className="mb-2 block text-[13.5px] font-bold text-text">
              PCAs do grupo · {pcasSel == null ? "todos" : `${pcasSel.size} selecionado(s)`}
            </legend>
            <Switch
              checked={pcasSel == null}
              onChange={(todos) => setPcasSel(todos ? null : new Set(pcasDisp.map((p) => p.id)))}
              label="Todos os PCAs (também os que forem criados)"
            />
            {pcasSel != null &&
              (pcasDisp.length === 0 ? (
                <p className="mt-2 rounded-control border border-dashed border-border-2 p-3 text-[12px] text-faint">Nenhum PCA cadastrado.</p>
              ) : (
                <div className="mt-2 max-h-[200px] space-y-1 overflow-y-auto rounded-control border border-border p-2">
                  {pcasDisp.map((p) => (
                    <div key={p.id} className="rounded-control p-1.5 hover:bg-surface-2">
                      <Checkbox
                        checked={pcasSel.has(p.id)}
                        onChange={() => setPcasSel((s) => {
                          const n = new Set(s ?? []);
                          if (n.has(p.id)) n.delete(p.id);
                          else n.add(p.id);
                          return n;
                        })}
                        label={
                          <span className="flex items-center gap-2">
                            {p.ano != null && <span className="font-mono text-[10.5px] text-faint">{p.ano}</span>}
                            <span className="min-w-0 truncate text-[13px] text-text">{p.nome}</span>
                          </span>
                        }
                      />
                    </div>
                  ))}
                </div>
              ))}
            {pcasSel != null && pcasSel.size === 0 && (
              <p className="mt-1.5 text-[12px] text-[var(--warn)]">Sem nenhum PCA, as pessoas do grupo não veem nenhum PCA.</p>
            )}
          </fieldset>
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
        </form>
      </Modal>
      {confirmacao}
    </div>
  );
}
