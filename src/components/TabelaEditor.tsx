"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { dataBR } from "@/lib/format";
import {
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconSearch,
  IconSpinner,
} from "./icons";

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

const CHIPS = [
  "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
];
function chipCor(v: string) {
  let h = 0;
  for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) >>> 0;
  return CHIPS[h % CHIPS.length];
}

const cell =
  "w-full min-w-[120px] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-emerald-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const filtro =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-emerald-500/20";

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
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">{nome}</h2>
        {podeEditar && (
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfig(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
              Configurar tabela
            </button>
            <button type="button" onClick={abrirNovo} disabled={editando === "novo"} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              + Adicionar linha
            </button>
          </div>
        )}
      </div>

      <div className="relative max-w-md">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nas linhas..." className={`${filtro} pl-9`} />
      </div>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{erro}</div>
      )}

      {colunas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Esta tabela ainda não tem colunas. {podeEditar && 'Use "Configurar tabela" para adicionar.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full border-collapse text-sm" style={{ minWidth: Math.max(600, colunas.length * 160) }}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                {colunas.map((c) => (
                  <th key={c.id} className="px-3 py-2.5 font-semibold">{c.nome}</th>
                ))}
                {podeEditar && <th className="px-3 py-2.5 text-right font-semibold">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {editando === "novo" && (
                <LinhaEdicao colunas={colunas} draft={draft} setCampo={setCampo} novaOpcao={novaOpcao} salvar={salvar} cancelar={cancelar} salvando={salvando} destaque />
              )}
              {loading && rows.length === 0 ? (
                <tr><td colSpan={totalCols} className="px-3 py-12 text-center text-slate-400"><IconSpinner className="mx-auto h-6 w-6" /></td></tr>
              ) : rows.length === 0 && editando !== "novo" ? (
                <tr><td colSpan={totalCols} className="px-3 py-12 text-center text-slate-400">Nenhuma linha. {podeEditar && 'Use "+ Adicionar linha".'}</td></tr>
              ) : (
                rows.map((l) =>
                  editando === l.id ? (
                    <LinhaEdicao key={l.id} colunas={colunas} draft={draft} setCampo={setCampo} novaOpcao={novaOpcao} salvar={salvar} cancelar={cancelar} salvando={salvando} />
                  ) : (
                    <tr key={l.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40">
                      {colunas.map((c) => (
                        <td key={c.id} className="px-3 py-2.5 align-top">
                          <CelulaView coluna={c} valor={l.dados[c.id] ?? ""} />
                        </td>
                      ))}
                      {podeEditar && (
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button type="button" onClick={() => abrirEdicao(l)} disabled={editando !== null} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 dark:text-emerald-400 dark:hover:bg-emerald-500/10">Editar</button>
                            <button type="button" onClick={() => excluirLinha(l)} disabled={editando !== null} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-500/10">Excluir</button>
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
        <span className="text-slate-500 dark:text-slate-400">{loading ? "Carregando..." : `${rows.length} de ${total} linha(s)`}</span>
        <div className="flex items-center gap-1">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 enabled:hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"><IconChevronLeft className="h-4 w-4" /></button>
          <span className="px-2 tabular-nums text-slate-500 dark:text-slate-400">{page} / {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 enabled:hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"><IconChevronRight className="h-4 w-4" /></button>
        </div>
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
  if (!valor) return <span className="text-slate-400">—</span>;
  if (coluna.tipo === "data") return <span className="tabular-nums text-slate-600 dark:text-slate-300">{dataBR(valor)}</span>;
  if (coluna.tipo === "selecao")
    return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${chipCor(valor)}`}>{valor}</span>;
  return <span className="text-slate-700 dark:text-slate-200">{valor}</span>;
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
        onChange={async (e) => {
          const v = e.target.value;
          if (v === "__novo__") {
            const nova = await novaOpcao(coluna);
            if (nova) onChange(nova);
          } else onChange(v);
        }}
      >
        <option value="">—</option>
        {lista.map((o) => <option key={o} value={o}>{o}</option>)}
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
    <tr className={`border-b border-slate-100 dark:border-slate-800/60 ${destaque ? "bg-emerald-50/50 dark:bg-emerald-500/5" : "bg-slate-50 dark:bg-slate-800/30"}`}>
      {colunas.map((c) => (
        <td key={c.id} className="px-2 py-2 align-top">
          <CelulaEdicao coluna={c} valor={draft[c.id] ?? ""} onChange={(v) => setCampo(c.id, v)} novaOpcao={novaOpcao} />
        </td>
      ))}
      <td className="px-2 py-2">
        <div className="flex items-center justify-end gap-1.5">
          <button type="button" onClick={salvar} disabled={salvando} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            {salvando && <IconSpinner className="h-3.5 w-3.5" />}Salvar
          </button>
          <button type="button" onClick={cancelar} disabled={salvando} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 dark:text-white">Configurar tabela</h3>
          <button type="button" onClick={onFechar} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar"><IconClose className="h-5 w-5" /></button>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Nome da tabela</span>
          <div className="flex gap-2">
            <input className={filtro} value={nomeTab} onChange={(e) => setNomeTab(e.target.value)} onBlur={salvarNome} />
          </div>
        </label>

        <div className="mt-5">
          <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Colunas</h4>
          <div className="space-y-2">
            {colunas.map((c) => (
              <div key={c.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-slate-800 dark:text-slate-100">{c.nome}</span>
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{TIPO_LABEL[c.tipo]}</span>
                  </div>
                  <button type="button" onClick={() => excluirColuna(c)} className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400">excluir</button>
                </div>
                {c.tipo === "selecao" && (
                  <div className="mt-2">
                    <div className="flex flex-wrap gap-1.5">
                      {c.opcoes.map((o) => (
                        <span key={o} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {o}
                          <button type="button" onClick={() => removerOpcao(c, o)} className="text-slate-400 hover:text-red-600" aria-label="Remover"><IconClose className="h-3 w-3" /></button>
                        </span>
                      ))}
                      <button type="button" onClick={async () => { await novaOpcao(c); await onMudou(); }} className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-slate-600 dark:text-emerald-400">+ opção</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-dashed border-slate-300 p-3 sm:flex-row dark:border-slate-700">
            <input className={filtro} placeholder="Nome da nova coluna" value={novaCol} onChange={(e) => setNovaCol(e.target.value)} />
            <select className={`${filtro} sm:w-40`} value={novoTipo} onChange={(e) => setNovoTipo(e.target.value as Tipo)}>
              {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
            <button type="button" onClick={adicionarColuna} disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">Adicionar</button>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
          <button type="button" onClick={excluirTabela} className="text-sm font-semibold text-red-600 hover:underline dark:text-red-400">Excluir esta tabela</button>
        </div>
      </div>
    </div>
  );
}
