"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { RESPONSAVEIS_VAZIO, type Responsaveis } from "@/lib/reparticao-responsaveis";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { TextField } from "./Field";
import { IconArrowDown, IconArrowUp, IconPencil, IconPlus, IconRefresh, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { ResponsaveisEditor } from "./ResponsaveisEditor";
import { Segmented } from "./Segmented";
import { SkeletonLinhas } from "./Skeleton";

type Orgao = {
  id: number;
  sigla: string;
  nome: string;
  orgaoEntidade: string | null;
  ordem: number;
  assinaturaUnica: boolean;
  responsaveis: Responsaveis;
};

export function OrgaosAdmin() {
  const router = useRouter();
  const [lista, setLista] = useState<Orgao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Orgao | "novo" | null>(null);
  const [sigla, setSigla] = useState("");
  const [nome, setNome] = useState("");
  const [orgaoEntidade, setOrgaoEntidade] = useState("");
  const [assinaturaUnica, setAssinaturaUnica] = useState(false);
  const [responsaveis, setResponsaveis] = useState<Responsaveis>(RESPONSAVEIS_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [recarregando, setRecarregando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch("/api/admin/orgaos");
      const j = (await r.json()) as { ok?: boolean; error?: string; orgaos?: Orgao[] };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar.");
      setLista(j.orgaos ?? []);
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
    setSigla("");
    setNome("");
    setOrgaoEntidade("");
    setAssinaturaUnica(false);
    setResponsaveis(RESPONSAVEIS_VAZIO);
  }
  function abrirEdicao(o: Orgao) {
    setEditando(o);
    setSigla(o.sigla);
    setNome(o.nome);
    setOrgaoEntidade(o.orgaoEntidade ?? "");
    setAssinaturaUnica(o.assinaturaUnica);
    setResponsaveis(o.responsaveis);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const novo = editando === "novo";
      const r = await fetch(novo ? "/api/admin/orgaos" : `/api/admin/orgaos/${(editando as Orgao).id}`, {
        method: novo ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sigla, nome, orgaoEntidade: orgaoEntidade.trim() || null, assinaturaUnica, responsaveis }),
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

  async function excluir(o: Orgao) {
    if (!confirm(`Excluir o órgão "${o.nome}"? As unidades ficam sem vínculo (nada é apagado).`)) return;
    const resp = await fetch(`/api/admin/orgaos/${o.id}`, { method: "DELETE" });
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
      const r = await fetch("/api/admin/orgaos/ordem", {
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
        <SkeletonLinhas linhas={4} />
      </div>
    );
  }

  const posDe = new Map(lista.map((o, i) => [o.id, i]));

  const colunas: Column<Orgao>[] = [
    { key: "pos", header: "#", filter: "none", minWidth: 40, render: (o) => <span className="tabular-nums text-faint">{(posDe.get(o.id) ?? 0) + 1}</span> },
    { key: "sigla", header: "Sigla", filter: "none", minWidth: 100, render: (o) => <Badge tone="violet">{o.sigla}</Badge> },
    { key: "nome", header: "Nome do órgão", filter: "none", minWidth: 220, render: (o) => <span className="font-medium text-text">{o.nome}</span> },
    {
      key: "orgaoEntidade",
      header: "Órgão/Entidade (identificação do DFD)",
      filter: "none",
      minWidth: 220,
      render: (o) =>
        o.orgaoEntidade ? (
          <span className="line-clamp-1 text-[12px] text-text-2" title={o.orgaoEntidade}>{o.orgaoEntidade}</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: "assinatura",
      header: "Assinatura",
      filter: "none",
      minWidth: 120,
      render: (o) => (o.assinaturaUnica ? <Badge tone="blue">Única</Badge> : <span className="text-[12px] text-faint">Por unidade</span>),
    },
    {
      key: "acoes",
      header: "Ações",
      filter: "none",
      align: "right",
      minWidth: 150,
      render: (o) => {
        const idx = posDe.get(o.id) ?? 0;
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" onClick={() => mover(o.id, -1)} disabled={idx === 0} aria-label="Mover para cima" icon={<IconArrowUp className="h-4 w-4" />} />
            <Button variant="ghost" onClick={() => mover(o.id, 1)} disabled={idx === lista.length - 1} aria-label="Mover para baixo" icon={<IconArrowDown className="h-4 w-4" />} />
            <Button variant="ghost" onClick={() => abrirEdicao(o)} aria-label="Editar" icon={<IconPencil className="h-4 w-4" />} />
            <Button variant="ghost" onClick={() => excluir(o)} aria-label="Excluir" style={{ color: "var(--danger)" }} icon={<IconTrash className="h-4 w-4" />} />
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Clique num órgão para gerenciar suas unidades. O “Órgão/Entidade” identifica de qual órgão é o DFD. Use ↑/↓ para ordenar.</p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={recarregar} loading={recarregando} icon={<IconRefresh className="h-4 w-4" />}>
            Recarregar
          </Button>
          <Button onClick={abrirNovo} icon={<IconPlus className="h-[18px] w-[18px]" />}>
            Novo órgão
          </Button>
        </div>
      </div>

      {erro && <Callout kind="danger">{erro}</Callout>}

      <DataTable columns={colunas} rows={lista} getKey={(o) => o.id} minWidth={900} onRowClick={(o) => router.push(`/painel/orgaos/${o.id}`)} />

      <Modal open={!!editando} onClose={() => setEditando(null)} titulo={editando === "novo" ? "Novo órgão" : "Editar órgão"}>
        <form onSubmit={salvar} className="space-y-4">
          <TextField label="Sigla" value={sigla} onChange={(e) => setSigla(e.target.value)} placeholder="Ex.: PMRV" required />
          <TextField label="Nome do órgão" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Prefeitura Municipal de Rio Verde" required />
          <TextField
            label="Órgão/Entidade (padrão para identificar o DFD)"
            value={orgaoEntidade}
            onChange={(e) => setOrgaoEntidade(e.target.value)}
            placeholder="Ex.: PREFEITURA MUNICIPAL DE RIO VERDE"
          />
          <div>
            <span className="mb-2 block text-[13px] font-semibold text-text">Assinatura (responsáveis por DFDs)</span>
            <Segmented<"unidade" | "unica">
              value={assinaturaUnica ? "unica" : "unidade"}
              options={[
                { value: "unidade", label: "Cada unidade tem a sua" },
                { value: "unica", label: "Uma para todas as unidades" },
              ]}
              onChange={(v) => setAssinaturaUnica(v === "unica")}
            />
          </div>
          {assinaturaUnica ? (
            <div>
              <span className="mb-2 block text-[13px] font-semibold text-text">Responsáveis do órgão (valem para todas as unidades)</span>
              <ResponsaveisEditor valor={responsaveis} onChange={setResponsaveis} />
            </div>
          ) : (
            <Callout kind="info">Cada unidade define os seus responsáveis por DFDs (na tela de unidades do órgão).</Callout>
          )}
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
