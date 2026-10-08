"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { CargoComUso } from "@/lib/cargos";
import { AcoesCadastro } from "./AcoesCadastro";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { ErroCarga } from "./ErroCarga";
import { TextField } from "./Field";
import { IconBriefcase, IconPlus, IconSave } from "./icons";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";

/**
 * CARGOS E FUNÇÕES (Configurações → Cargos e funções, ou Usuários → Cargos e funções; só o ADM): a lista que o CADASTRO
 * dos usuários e a planilha dos RESPONSÁVEIS oferecem. Cadastrar/renomear no campo do topo (renomear leva junto o cargo de
 * usuários e responsáveis), ordenar ↑/↓ (a ordem da lista) e excluir (quem o tem mantém até o ADM trocar — a confirmação
 * diz quantos). `onMudou` = a lista mudou
 * (quem abriu recarrega). Só componentes do design-system.
 */
/** Quantos cadastros usam o cargo (usuários + responsáveis) e o texto por extenso. */
const uso = (c: CargoComUso) => c.emUso + c.responsaveis;
const textoUso = (c: CargoComUso) =>
  [c.emUso ? `${c.emUso} usuário(s)` : "", c.responsaveis ? `${c.responsaveis} responsável(is)` : ""].filter(Boolean).join(" e ");

export function CargosAdmin({ onMudou }: { onMudou?: () => void }) {
  const [lista, setLista] = useState<CargoComUso[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [editando, setEditando] = useState<CargoComUso | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/cargos");
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; cargos?: CargoComUso[] };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar os cargos.");
      setLista(j.cargos ?? []);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar os cargos.");
      setLista((l) => l ?? []);
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function chamar(url: string, init: RequestInit, sucesso: string): Promise<boolean> {
    try {
      const r = await fetch(url, init);
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      toast.success(sucesso);
      await carregar();
      onMudou?.();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
      return false;
    }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const n = nome.trim();
    if (n.length < 2) return toast.error("Informe o nome do cargo ou função.");
    setSalvando(true);
    const ok = await chamar(
      editando ? `/api/admin/cargos/${editando.id}` : "/api/admin/cargos",
      { method: editando ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: n }) },
      editando ? `Renomeado para "${n}"${uso(editando) ? ` — e em ${uso(editando)} cadastro(s)` : ""}.` : `"${n}" cadastrado.`,
    );
    setSalvando(false);
    if (ok) {
      setNome("");
      setEditando(null);
    }
  }

  async function excluir(c: CargoComUso) {
    const sim = await confirmar({
      titulo: `Excluir "${c.nome}"?`,
      texto: uso(c) ? `${textoUso(c)} continuam com este cargo até você trocar; ele só sai da lista.` : "Ele sai da lista.",
      confirmar: "Excluir",
      perigo: true,
    });
    if (sim) await chamar(`/api/admin/cargos/${c.id}`, { method: "DELETE" }, `"${c.nome}" excluído.`);
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
      const r = await fetch("/api/admin/cargos/ordem", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: nova.map((x) => x.id) }),
      });
      if (!r.ok) throw new Error();
      onMudou?.();
    } catch {
      toast.error("Não foi possível salvar a nova ordem.");
      await carregar();
    }
  }

  if (lista === null) return <SkeletonLinhas linhas={4} />;
  const pos = new Map(lista.map((c, i) => [c.id, i]));
  const cols: Column<CargoComUso>[] = [
    { key: "nome", header: "Cargo ou função", filter: "none", align: "left", minWidth: 110, render: (c) => <span className="font-medium text-text">{c.nome}</span> },
    {
      key: "uso",
      header: "Uso",
      filter: "none",
      nowrap: true,
      render: (c) => (
        <span className="tabular-nums" title={textoUso(c) || "Sem uso"}>
          {uso(c)}
        </span>
      ),
    },
    {
      key: "acoes",
      header: "",
      filter: "none",
      align: "right",
      nowrap: true,
      render: (c) => (
        <AcoesCadastro
          nome={c.nome}
          primeira={(pos.get(c.id) ?? 0) === 0}
          ultima={(pos.get(c.id) ?? 0) === lista.length - 1}
          disabled={salvando}
          onMover={(d) => mover(c.id, d)}
          onEditar={() => {
            setEditando(c);
            setNome(c.nome);
          }}
          onExcluir={() => excluir(c)}
        />
      ),
    },
  ];

  return (
    <div className="space-y-[var(--gap-block)]">
      {erro && <ErroCarga kind="warn" msg={erro} onTentar={carregar} />}
      <form onSubmit={salvar} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <TextField
            label={editando ? `Renomear "${editando.nome}"` : "Novo cargo ou função"}
            icon={<IconBriefcase className="h-5 w-5" />}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={80}
            placeholder="Ex.: Analista de Planejamento"
            denso
          />
        </div>
        <div className="flex gap-2">
          {editando && (
            <Button
              variant="secondary"
              className="lg:h-11"
              onClick={() => {
                setEditando(null);
                setNome("");
              }}
            >
              Cancelar
            </Button>
          )}
          <Button type="submit" className="flex-1 sm:flex-none lg:h-11" loading={salvando} icon={editando ? <IconSave className="h-4 w-4" /> : <IconPlus className="h-4 w-4" />}>
            {editando ? "Salvar" : "Adicionar"}
          </Button>
        </div>
      </form>
      {lista.length === 0 ? (
        <p className="rounded-card border border-border bg-surface-2 p-[var(--pad-card)] text-center text-sm text-muted">
          Nenhum cargo cadastrado — enquanto a lista estiver vazia, o cadastro não pede o cargo.
        </p>
      ) : (
        <DataTable
          columns={cols}
          rows={lista}
          getKey={(c) => c.id}
          activeKey={editando?.id ?? null}
          pageSize={20}
          minWidth={300}
          density="compact"
          resumo={(l) => `${l.length} cargo(s)/função(ões)`}
        />
      )}
      {confirmacao}
    </div>
  );
}
