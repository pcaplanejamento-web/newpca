"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { dataBR } from "@/lib/format";
import { Badge, hashTone } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { cellCls, inputCls, selectCls } from "./formStyles";
import { IconClose, IconPencil, IconPlus, IconSpinner, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { Pager } from "./Pager";
import { SearchField } from "./Field";

type Tipo = "texto" | "selecao" | "data" | "numero";
type Coluna = { id: number; nome: string; tipo: Tipo; ordem: number; opcoes: string[] };
type LinhaRow = { id: number; dados: Record<string, string> };
type Dados = Record<string, string>;

const TIPOS: { v: Tipo; label: string }[] = [
  { v: "texto", label: "Texto" },
  { v: "selecao", label: "Seleção" },
  { v: "data", label: "Data" },
  { v: "numero", label: "Número" },
];
const TIPO_LABEL: Record<Tipo, string> = {
  texto: "Texto",
  selecao: "Seleção",
  data: "Data",
  numero: "Número",
};

const cell = `${cellCls} min-w-[120px]`;

export function TabelaEditor({
  tabelaId,
  nomeInicial,
  colunasIniciais,
  podeEditar,
}: {
  tabelaId: number;
  nomeInicial: string;
  colunasIniciais: Coluna[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [nome, setNome] = useState(nomeInicial);
  const [colunas, setColunas] = useState<Coluna[]>(colunasIniciais);

  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<LinhaRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [editando, setEditando] = useState<number | "novo" | null>(null);
  const [draft, setDraft] = useState<Dados>({});
  const [salvando, setSalvando] = useState(false);
  const [config, setConfig] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDeb(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [qDeb]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    const p = new URLSearchParams();
    if (qDeb.trim()) p.set("q", qDeb.trim());
    p.set("page", String(page));
    try {
      const r = await fetch(`/api/tabelas/${tabelaId}/linhas?${p}`);
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar.");
      setRows(j.rows);
      setTotal(j.total);
      setPages(j.pages);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tabelaId, qDeb, page]);

  const carregarColunas = useCallback(async () => {
    try {
      const r = await fetch(`/api/tabelas/${tabelaId}`);
      const j = await r.json();
      if (j.ok) {
        setColunas(j.colunas);
        setNome(j.tabela.nome);
      }
    } catch {
      /* silencioso */
    }
  }, [tabelaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    const hoje = new Date().toISOString().slice(0, 10);
    const d: Dados = {};
    for (const c of colunas) if (c.tipo === "data") d[c.id] = hoje; // preferência: data atual
    setDraft(d);
    setEditando("novo");
  }
  function abrirEdicao(l: LinhaRow) {
    setDraft({ ...l.dados });
    setEditando(l.id);
  }
  const cancelar = () => {
    setEditando(null);
    setDraft({});
  };
  const setCampo = (colId: number, v: string) => setDraft((d) => ({ ...d, [colId]: v }));

  async function novaOpcao(coluna: Coluna): Promise<string | null> {
    const valor = window.prompt(`Nova opção para "${coluna.nome}":`)?.trim();
    if (!valor) return null;
    try {
      const r = await fetch(`/api/colunas/${coluna.id}/opcoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro.");
      await carregarColunas();
      return j.valor as string;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao adicionar opção.");
      return null;
    }
  }

  async function salvar() {
    setSalvando(true);
    try {
      const url = editando === "novo" ? `/api/tabelas/${tabelaId}/linhas` : `/api/linhas/${editando}`;
      const r = await fetch(url, {
        method: editando === "novo" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dados: draft }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      cancelar();
      await carregar();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirLinha(l: LinhaRow) {
    if (!confirm("Excluir esta linha?")) return;
    try {
      const r = await fetch(`/api/linhas/${l.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro.");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  const totalCols = colunas.length + (podeEditar ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold text-text">{nome}</h2>
        {podeEditar && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfig(true)}>
              Configurar tabela
            </Button>
            <Button onClick={abrirNovo} disabled={editando === "novo"} icon={<IconPlus className="h-4 w-4" />}>
              Adicionar linha
            </Button>
          </div>
        )}
      </div>

      <div className="max-w-md">
        <SearchField value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} placeholder="Buscar nas linhas..." />
      </div>

      {erro && <Callout kind="danger">{erro}</Callout>}

      {colunas.length === 0 ? (
        <div className="rounded-card border border-dashed border-border-2 p-10 text-center text-sm text-muted">
          Esta tabela ainda não tem colunas. {podeEditar && 'Use "Configurar tabela" para adicionar.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full border-collapse text-sm" style={{ minWidth: Math.max(600, colunas.length * 160) }}>
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-[10.5px] uppercase tracking-[0.05em] text-faint">
                {colunas.map((c) => (
                  <th key={c.id} className="px-3 py-2.5 font-semibold">
                    {c.nome}
                  </th>
                ))}
                {podeEditar && <th className="px-3 py-2.5 text-right font-semibold">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {editando === "novo" && (
                <LinhaEdicao colunas={colunas} draft={draft} setCampo={setCampo} novaOpcao={novaOpcao} salvar={salvar} cancelar={cancelar} salvando={salvando} destaque />
              )}
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={totalCols} className="px-3 py-12 text-center text-faint">
                    <IconSpinner className="mx-auto h-6 w-6" />
                  </td>
                </tr>
              ) : rows.length === 0 && editando !== "novo" ? (
                <tr>
                  <td colSpan={totalCols} className="px-3 py-12 text-center text-faint">
                    Nenhuma linha. {podeEditar && 'Use "Adicionar linha".'}
                  </td>
                </tr>
              ) : (
                rows.map((l) =>
                  editando === l.id ? (
                    <LinhaEdicao key={l.id} colunas={colunas} draft={draft} setCampo={setCampo} novaOpcao={novaOpcao} salvar={salvar} cancelar={cancelar} salvando={salvando} />
                  ) : (
                    <tr key={l.id} className="border-b border-border transition-colors last:border-0 hover:bg-surface-2">
                      {colunas.map((c) => (
                        <td key={c.id} className="px-3 py-2.5 align-top">
                          <CelulaView coluna={c} valor={l.dados[c.id] ?? ""} />
                        </td>
                      ))}
                      {podeEditar && (
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button variant="ghost" onClick={() => abrirEdicao(l)} disabled={editando !== null} icon={<IconPencil className="h-3.5 w-3.5" />}>
                              Editar
                            </Button>
                            <Button variant="ghost" onClick={() => excluirLinha(l)} disabled={editando !== null} style={{ color: "var(--danger)" }} icon={<IconTrash className="h-3.5 w-3.5" />}>
                              Excluir
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted">{loading ? "Carregando..." : `${rows.length} de ${total} linha(s)`}</span>
        <Pager page={page} pages={pages} onChange={setPage} />
      </div>

      {config && (
        <ConfigTabela
          tabelaId={tabelaId}
          nome={nome}
          colunas={colunas}
          onFechar={() => setConfig(false)}
          onMudou={carregarColunas}
          onExcluida={() => router.push("/painel/protocolos")}
          novaOpcao={novaOpcao}
        />
      )}
    </div>
  );
}

/* ------------------------------ Células ------------------------------ */

function CelulaView({ coluna, valor }: { coluna: Coluna; valor: string }) {
  if (!valor) return <span className="text-faint">—</span>;
  if (coluna.tipo === "data") return <span className="tabular-nums text-text-2">{dataBR(valor)}</span>;
  if (coluna.tipo === "selecao") return <Badge tone={hashTone(valor)}>{valor}</Badge>;
  return <span className="text-text-2">{valor}</span>;
}

function CelulaEdicao({
  coluna,
  valor,
  onChange,
  novaOpcao,
}: {
  coluna: Coluna;
  valor: string;
  onChange: (v: string) => void;
  novaOpcao: (c: Coluna) => Promise<string | null>;
}) {
  if (coluna.tipo === "data")
    return <input type="date" className={cell} value={valor} onChange={(e) => onChange(e.target.value)} />;
  if (coluna.tipo === "numero")
    return <input type="number" className={cell} value={valor} onChange={(e) => onChange(e.target.value)} />;
  if (coluna.tipo === "selecao") {
    const base = coluna.opcoes ?? [];
    const lista = valor && !base.includes(valor) ? [valor, ...base] : base;
    return (
      <select
        className={cell}
        value={valor}
        aria-label={coluna.nome}
        onChange={async (e) => {
          const v = e.target.value;
          if (v === "__novo__") {
            const nova = await novaOpcao(coluna);
            if (nova) onChange(nova);
          } else onChange(v);
        }}
      >
        <option value="">—</option>
        {lista.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value="__novo__">+ Nova opção…</option>
      </select>
    );
  }
  return <input className={cell} value={valor} onChange={(e) => onChange(e.target.value)} />;
}

function LinhaEdicao({
  colunas,
  draft,
  setCampo,
  novaOpcao,
  salvar,
  cancelar,
  salvando,
  destaque,
}: {
  colunas: Coluna[];
  draft: Dados;
  setCampo: (colId: number, v: string) => void;
  novaOpcao: (c: Coluna) => Promise<string | null>;
  salvar: () => void;
  cancelar: () => void;
  salvando: boolean;
  destaque?: boolean;
}) {
  return (
    <tr className={`border-b border-border ${destaque ? "bg-accent-soft/50" : "bg-surface-2"}`}>
      {colunas.map((c) => (
        <td key={c.id} className="px-2 py-2 align-top">
          <CelulaEdicao coluna={c} valor={draft[c.id] ?? ""} onChange={(v) => setCampo(c.id, v)} novaOpcao={novaOpcao} />
        </td>
      ))}
      <td className="px-2 py-2">
        <div className="flex items-center justify-end gap-1.5">
          <Button onClick={salvar} loading={salvando}>
            Salvar
          </Button>
          <Button variant="secondary" onClick={cancelar} disabled={salvando}>
            Cancelar
          </Button>
        </div>
      </td>
    </tr>
  );
}

/* --------------------------- Configurar tabela --------------------------- */

function ConfigTabela({
  tabelaId,
  nome,
  colunas,
  onFechar,
  onMudou,
  onExcluida,
  novaOpcao,
}: {
  tabelaId: number;
  nome: string;
  colunas: Coluna[];
  onFechar: () => void;
  onMudou: () => Promise<void>;
  onExcluida: () => void;
  novaOpcao: (c: Coluna) => Promise<string | null>;
}) {
  const [nomeTab, setNomeTab] = useState(nome);
  const [novaCol, setNovaCol] = useState("");
  const [novoTipo, setNovoTipo] = useState<Tipo>("texto");
  const [busy, setBusy] = useState(false);

  async function salvarNome() {
    if (!nomeTab.trim() || nomeTab === nome) return;
    await fetch(`/api/tabelas/${tabelaId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: nomeTab.trim() }) });
    await onMudou();
  }
  async function adicionarColuna() {
    if (!novaCol.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/tabelas/${tabelaId}/colunas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: novaCol.trim(), tipo: novoTipo }) });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro.");
      setNovaCol("");
      setNovoTipo("texto");
      await onMudou();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao adicionar coluna.");
    } finally {
      setBusy(false);
    }
  }
  async function excluirColuna(c: Coluna) {
    if (!confirm(`Excluir a coluna "${c.nome}"? Os valores dessa coluna serão perdidos.`)) return;
    await fetch(`/api/colunas/${c.id}`, { method: "DELETE" });
    await onMudou();
  }
  async function removerOpcao(c: Coluna, valor: string) {
    await fetch(`/api/colunas/${c.id}/opcoes`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valor }) });
    await onMudou();
  }
  async function excluirTabela() {
    if (!confirm(`Excluir a tabela "${nome}" e TODAS as suas linhas? Não pode ser desfeito.`)) return;
    await fetch(`/api/tabelas/${tabelaId}`, { method: "DELETE" });
    onExcluida();
  }

  return (
    <Modal open onClose={onFechar} titulo="Configurar tabela" size="lg" scrollable fecharNoBackdrop={false}>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-text-2">Nome da tabela</span>
        <input className={inputCls} value={nomeTab} onChange={(e) => setNomeTab(e.target.value)} onBlur={salvarNome} />
      </label>

      <div className="mt-5">
        <h4 className="mb-2 text-sm font-semibold text-text-2">Colunas</h4>
        <div className="space-y-2">
          {colunas.map((c) => (
            <div key={c.id} className="rounded-control border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-medium text-text">{c.nome}</span>
                  <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{TIPO_LABEL[c.tipo]}</span>
                </div>
                <Button variant="ghost" onClick={() => excluirColuna(c)} style={{ color: "var(--danger)" }}>
                  excluir
                </Button>
              </div>
              {c.tipo === "selecao" && (
                <div className="mt-2">
                  <div className="flex flex-wrap gap-1.5">
                    {c.opcoes.map((o) => (
                      <span key={o} className="inline-flex items-center gap-1 rounded-full border border-border-2 bg-surface-2 px-2 py-0.5 text-xs text-text-2">
                        {o}
                        <button type="button" onClick={() => removerOpcao(c, o)} className="text-faint hover:text-[var(--danger)]" aria-label="Remover">
                          <IconClose className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <button type="button" onClick={async () => { await novaOpcao(c); await onMudou(); }} className="rounded-full border border-dashed border-border-2 px-2 py-0.5 text-xs font-semibold text-accent hover:bg-surface-2">
                      + opção
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-2 rounded-control border border-dashed border-border-2 p-3 sm:flex-row">
          <input className={inputCls} placeholder="Nome da nova coluna" value={novaCol} onChange={(e) => setNovaCol(e.target.value)} />
          <select className={`${selectCls} sm:w-40`} value={novoTipo} onChange={(e) => setNovoTipo(e.target.value as Tipo)} aria-label="Tipo da coluna">
            {TIPOS.map((t) => (
              <option key={t.v} value={t.v}>
                {t.label}
              </option>
            ))}
          </select>
          <Button onClick={adicionarColuna} loading={busy}>
            Adicionar
          </Button>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-4">
        <Button variant="ghost" onClick={excluirTabela} style={{ color: "var(--danger)" }} icon={<IconTrash className="h-4 w-4" />}>
          Excluir esta tabela
        </Button>
      </div>
    </Modal>
  );
}
