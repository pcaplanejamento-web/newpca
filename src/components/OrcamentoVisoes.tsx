"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { brl, num } from "@/lib/format";
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
import { FerramentasAba } from "./AbasEspaco";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { TextField } from "./Field";
import { IconPlus, IconTrash } from "./icons";
import { SeletorMultiplo } from "./SeletorMultiplo";

type Linha = LinhaOrcamentoVisao & { valorInicial: number };

/**
 * VISÕES SALVAS do orçamento (globais — o PCA escolhe a sua na Configuração): tabela padrão da Mesa com cada visão, o
 * resumo dos filtros e o Σ que ela pega DESTE orçamento; clicar numa linha abre o editor ao lado (nome + uma linha por
 * dimensão do CUBO, opções CONECTADAS + prévia do Σ). "Criar visão" fica na barra das abas (`FerramentasAba`). As
 * visões vêm do servidor; salvar/excluir recarrega a página.
 */
export function OrcamentoVisoes({ itens, visoes, podeEditar }: { itens: Linha[]; visoes: VisaoOrcamento[]; podeEditar: boolean }) {
  const router = useRouter();
  const [editando, setEditando] = useState<VisaoOrcamento | "nova" | null>(null);
  const [nome, setNome] = useState("");
  const [filtros, setFiltros] = useState<FiltrosVisao>({});
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ kind: "ok" | "danger"; texto: string } | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();

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
      router.refresh();
    } catch (e) {
      setAviso({ kind: "danger", texto: e instanceof Error ? e.message : "Não foi possível salvar a visão." });
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(v: VisaoOrcamento) {
    const ok = await confirmar({
      titulo: `Excluir a visão "${v.nome}"?`,
      texto: "Os PCAs que a usam passam a considerar o orçamento inteiro.",
      confirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    const r = await fetch(`/api/orcamento/visoes/${v.id}`, { method: "DELETE" });
    if (!r.ok) setAviso({ kind: "danger", texto: "Não foi possível excluir a visão." });
    if (editando !== "nova" && editando?.id === v.id) setEditando(null);
    router.refresh();
  }

  // Σ e lançamentos que cada visão pega DESTE orçamento (informação útil na lista).
  const naVisaoPorId = useMemo(() => {
    const m = new Map<number, { soma: number; linhas: number }>();
    for (const v of visoes) {
      const f = aplicarVisao(itens, v.filtros);
      m.set(v.id, { soma: f.reduce((s, i) => s + i.valorInicial, 0), linhas: f.length });
    }
    return m;
  }, [itens, visoes]);
  const colunas: Column<VisaoOrcamento>[] = [
    { key: "nome", header: "Visão", align: "left", minWidth: 200, value: (v) => v.nome, render: (v) => <span className="font-semibold text-text">{v.nome}</span> },
    {
      key: "filtros",
      header: "Filtros",
      align: "left",
      minWidth: 220,
      value: (v) => resumoVisao(v.filtros),
      render: (v) => <span className="text-text-2">{resumoVisao(v.filtros)}</span>,
    },
    {
      key: "lancamentos",
      header: "Lançamentos",
      nowrap: true,
      filter: "range",
      formatarFaixa: num,
      numero: (v) => naVisaoPorId.get(v.id)?.linhas ?? 0,
      render: (v) => <span className="tabular-nums text-text-2">{num(naVisaoPorId.get(v.id)?.linhas ?? 0)}</span>,
    },
    {
      key: "dotacao",
      header: "Dotação na visão",
      align: "right",
      nowrap: true,
      filter: "range",
      numero: (v) => naVisaoPorId.get(v.id)?.soma ?? 0,
      render: (v) => <span className="tabular-nums font-semibold text-text">{brl(naVisaoPorId.get(v.id)?.soma ?? 0)}</span>,
    },
    ...(podeEditar
      ? [
          {
            key: "acoes",
            header: "",
            filter: "none" as const,
            nowrap: true,
            render: (v: VisaoOrcamento) => (
              <Button
                size="xs"
                variant="ghost"
                aria-label={`Excluir ${v.nome}`}
                icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
                onClick={(e) => {
                  e.stopPropagation();
                  void excluir(v);
                }}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      {podeEditar && (
        <FerramentasAba>
          <Button size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => abrir("nova")} disabled={salvando}>
            Criar visão
          </Button>
        </FerramentasAba>
      )}
      <div className={editando ? "grid grid-cols-1 gap-[var(--gap-block)] lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]" : ""}>
        <DataTable
          columns={colunas}
          rows={visoes}
          getKey={(v) => v.id}
          scrollInterno
          density="compact"
          minWidth={720}
          onRowClick={(v) => abrir(v)}
          activeKey={editando !== "nova" && editando ? editando.id : null}
          vazio={podeEditar ? "Nenhuma visão salva ainda. Use “Criar visão”." : "Nenhuma visão salva ainda."}
          resumo={(ls) => `${num(ls.length)} ${ls.length === 1 ? "visão" : "visões"} · Dotação do orçamento ${brl(total)}`}
        />
        {editando && (
          // No desktop o editor tem a ALTURA da tabela ao lado (até o fim do display — o conteúdo absoluto não estica a
          // linha do grid): título/nome e ações fixos, as dimensões rolam por dentro. No celular, fluxo normal.
          <section className="relative rounded-card border border-border bg-surface">
            <div className="flex flex-col gap-3 p-[var(--pad-card)] lg:absolute lg:inset-0">
              <h2 className="text-sm font-bold text-text">{editando === "nova" ? "Nova visão" : podeEditar ? "Editar visão" : "Visão"}</h2>
              <TextField label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: PCA" maxLength={80} disabled={!podeEditar} />
              <div className="space-y-2 lg:-mx-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-1">
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
              </div>
              <p className="rounded-control bg-surface-2 px-3 py-2 text-sm text-text-2">
                Na visão: <b className="tabular-nums">{brl(somaVisao)}</b> de <span className="tabular-nums">{brl(total)}</span> · {num(naVisao.length)}{" "}
                {naVisao.length === 1 ? "lançamento" : "lançamentos"}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditando(null)} disabled={salvando}>
                  {podeEditar ? "Cancelar" : "Fechar"}
                </Button>
                {podeEditar && (
                  <Button size="sm" onClick={salvar} loading={salvando} disabled={!nome.trim()}>
                    {editando === "nova" ? "Criar visão" : "Atualizar visão"}
                  </Button>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
      {confirmacao}
      {aviso && (
        <AvisoFlutuante kind={aviso.kind} titulo={aviso.kind === "ok" ? "Pronto" : "Atenção"} onClose={() => setAviso(null)} duracao={aviso.kind === "ok" ? 4000 : undefined}>
          {aviso.texto}
        </AvisoFlutuante>
      )}
    </>
  );
}
