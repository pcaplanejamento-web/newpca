"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { brl } from "@/lib/format";
import {
  aplicarVisao,
  DIMENSOES_ORCAMENTO,
  type DimensaoOrcamento,
  type FiltrosVisao,
  type LinhaOrcamentoVisao,
  opcoesDaDimensao,
  resumoVisao,
  type VisaoOrcamento,
} from "@/lib/orcamento-visao";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { TextField } from "./Field";
import { IconPencil, IconPlus, IconTrash } from "./icons";
import { SeletorMultiplo } from "./SeletorMultiplo";
import { SkeletonLinhas } from "./Skeleton";

type Linha = LinhaOrcamentoVisao & { valorInicial: number };

/**
 * VISÕES SALVAS do orçamento: cada visão filtra os lançamentos do CUBO por VÁRIOS valores de cada
 * dimensão (órgão, unidade, elemento…; vazio = Todos). À esquerda o editor (nome + uma linha por
 * dimensão, opções CONECTADAS às demais escolhas + prévia do Σ), à direita as visões salvas. O PCA
 * escolhe a sua na Configuração (orçamento para o PCA).
 */
export function OrcamentoVisoes({ itens, podeEditar }: { itens: Linha[]; podeEditar: boolean }) {
  const [visoes, setVisoes] = useState<VisaoOrcamento[] | null>(null);
  const [editando, setEditando] = useState<VisaoOrcamento | "nova" | null>(null);
  const [nome, setNome] = useState("");
  const [filtros, setFiltros] = useState<FiltrosVisao>({});
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ kind: "ok" | "danger"; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/orcamento/visoes");
      const j = (await r.json()) as { ok?: boolean; visoes?: VisaoOrcamento[]; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar as visões.");
      setVisoes(j.visoes ?? []);
    } catch (e) {
      setVisoes([]);
      setAviso({ kind: "danger", texto: e instanceof Error ? e.message : "Erro ao carregar as visões." });
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrir = (v: VisaoOrcamento | "nova") => {
    setEditando(v);
    setNome(v === "nova" ? "" : v.nome);
    setFiltros(v === "nova" ? {} : v.filtros);
  };

  const total = useMemo(() => itens.reduce((s, i) => s + i.valorInicial, 0), [itens]);
  const naVisao = useMemo(() => aplicarVisao(itens, filtros), [itens, filtros]);
  const somaVisao = naVisao.reduce((s, i) => s + i.valorInicial, 0);
  const opcoes = useMemo(() => {
    const m = new Map<DimensaoOrcamento, { valor: string; contagem: number }[]>();
    if (!editando) return m;
    for (const d of DIMENSOES_ORCAMENTO) m.set(d.key, opcoesDaDimensao(itens, d.key, filtros).map((o) => ({ valor: o.valor, contagem: o.linhas })));
    return m;
  }, [itens, filtros, editando]);

  async function salvar() {
    if (!editando || !nome.trim()) return;
    setSalvando(true);
    try {
      const nova = editando === "nova";
      const r = await fetch(nova ? "/api/orcamento/visoes" : `/api/orcamento/visoes/${editando.id}`, {
        method: nova ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), filtros }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível salvar a visão.");
      setAviso({ kind: "ok", texto: nova ? "Visão criada." : "Visão atualizada." });
      setEditando(null);
      await carregar();
    } catch (e) {
      setAviso({ kind: "danger", texto: e instanceof Error ? e.message : "Não foi possível salvar a visão." });
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(v: VisaoOrcamento) {
    if (!confirm(`Excluir a visão "${v.nome}"? Os PCAs que a usam passam a considerar o orçamento inteiro.`)) return;
    const r = await fetch(`/api/orcamento/visoes/${v.id}`, { method: "DELETE" });
    if (!r.ok) setAviso({ kind: "danger", texto: "Não foi possível excluir a visão." });
    if (editando !== "nova" && editando?.id === v.id) setEditando(null);
    await carregar();
  }

  return (
    <div className="space-y-[var(--gap-block)] rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
      <div className="border-b border-border pb-3">
        <h2 className="font-bold text-text">Visões salvas do orçamento</h2>
        <p className="mt-1 text-sm text-muted">
          Cada visão filtra o orçamento por VÁRIOS valores (órgão, unidade, elemento…). O PCA usa a visão escolhida na aba
          Configuração como o orçamento para o PCA.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-[var(--gap-block)] lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="space-y-3">
          {!editando ? (
            podeEditar ? (
              <button
                type="button"
                onClick={() => abrir("nova")}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-border-2 text-sm font-semibold text-muted hover:border-accent/50 hover:text-accent"
              >
                <IconPlus className="h-4 w-4" /> Criar visão
              </button>
            ) : (
              <p className="text-sm text-muted">Escolha uma visão ao lado para ver os filtros.</p>
            )
          ) : (
            <>
              <h3 className="border-b border-border pb-2 font-bold text-text">{editando === "nova" ? "Nova visão" : "Editar visão"}</h3>
              <TextField label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: PCA" maxLength={80} disabled={!podeEditar} />
              {DIMENSOES_ORCAMENTO.map((d) => (
                <SeletorMultiplo
                  key={d.key}
                  rotulo={d.rotulo}
                  opcoes={opcoes.get(d.key) ?? []}
                  selecionados={filtros[d.key] ?? []}
                  disabled={!podeEditar}
                  onChange={(vals) => setFiltros((f) => ({ ...f, [d.key]: vals.length ? vals : undefined }))}
                />
              ))}
              <p className="rounded-control bg-surface-2 px-3 py-2 text-sm text-text-2">
                Na visão: <b>{brl(somaVisao)}</b> de {brl(total)} (dotação inicial) · {naVisao.length} lançamento(s)
              </p>
              <div className="flex flex-wrap gap-2">
                {podeEditar && (
                  <Button onClick={salvar} loading={salvando} disabled={!nome.trim()}>
                    {editando === "nova" ? "Criar visão" : "Atualizar visão"}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setEditando(null)} disabled={salvando}>
                  Cancelar
                </Button>
              </div>
            </>
          )}
        </div>
        <div className="space-y-3">
          {visoes === null ? (
            <SkeletonLinhas linhas={3} />
          ) : visoes.length === 0 ? (
            <p className="rounded-card border border-border p-6 text-center text-sm text-muted">Nenhuma visão salva ainda.</p>
          ) : (
            visoes.map((v) => {
              const ativa = editando !== "nova" && editando?.id === v.id;
              return (
                <div
                  key={v.id}
                  className={`flex flex-wrap items-center gap-3 rounded-card border p-4 ${ativa ? "border-accent" : "border-border"}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-text">{v.nome}</div>
                    <div className="text-sm text-muted">{resumoVisao(v.filtros)}</div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant={ativa ? "secondary" : "ghost"} icon={<IconPencil className="h-4 w-4" />} onClick={() => abrir(v)}>
                      {podeEditar ? "Editar" : "Ver"}
                    </Button>
                    {podeEditar && <Button variant="danger" icon={<IconTrash className="h-4 w-4" />} onClick={() => excluir(v)} aria-label={`Excluir ${v.nome}`} />}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      {aviso && (
        <AvisoFlutuante kind={aviso.kind} titulo={aviso.kind === "ok" ? "Pronto" : "Atenção"} onClose={() => setAviso(null)} duracao={aviso.kind === "ok" ? 4000 : undefined}>
          {aviso.texto}
        </AvisoFlutuante>
      )}
    </div>
  );
}
