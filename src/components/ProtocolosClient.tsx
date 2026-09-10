"use client";

import { useCallback, useEffect, useState } from "react";
import { dataBR } from "@/lib/format";
import {
  SITUACAO,
  naturezaStyle,
  situacaoLabel,
  situacaoStyle,
} from "@/lib/protocolo-constantes";
import {
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconSearch,
  IconSpinner,
} from "./icons";

type Cat = "secretaria" | "natureza" | "responsavel" | "distribuicao";
const CAT_LABEL: Record<Cat, string> = {
  secretaria: "Secretaria/Órgão",
  natureza: "Natureza",
  responsavel: "Responsável",
  distribuicao: "Distribuição",
};
const CATS: Cat[] = ["secretaria", "natureza", "responsavel", "distribuicao"];

type Row = {
  id: number;
  data: string | null;
  numero: string;
  secretaria: string | null;
  natureza: string | null;
  responsavel: string | null;
  situacao: string;
  distribuicao: string | null;
};
type Resumo = {
  total: number;
  emAberto: number;
  finalizados: number;
  porSituacao: Record<string, number>;
};
type Agrupado = Record<Cat, string[]>;
type OpcaoRow = { id: number; categoria: string; valor: string };

const vazio = {
  data: "",
  numero: "",
  secretaria: "",
  natureza: "",
  responsavel: "",
  situacao: "em_analise",
  distribuicao: "",
};
type Draft = typeof vazio;

const cellInput =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-emerald-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const filtro =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-emerald-500/20";

const emptyAgrupado: Agrupado = { secretaria: [], natureza: [], responsavel: [], distribuicao: [] };

export function ProtocolosClient({ podeEditar }: { podeEditar: boolean }) {
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [fSituacao, setFSituacao] = useState("");
  const [fResp, setFResp] = useState("");
  const [fNatureza, setFNatureza] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<Row[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [agrupado, setAgrupado] = useState<Agrupado>(emptyAgrupado);
  const [opcRows, setOpcRows] = useState<OpcaoRow[]>([]);

  const [editando, setEditando] = useState<number | "novo" | null>(null);
  const [draft, setDraft] = useState<Draft>(vazio);
  const [salvando, setSalvando] = useState(false);
  const [gerAberto, setGerAberto] = useState(false);

  // debounce busca
  useEffect(() => {
    const t = setTimeout(() => setQDeb(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [qDeb, fSituacao, fResp, fNatureza]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    const p = new URLSearchParams();
    if (qDeb.trim()) p.set("q", qDeb.trim());
    if (fSituacao) p.set("situacao", fSituacao);
    if (fResp) p.set("responsavel", fResp);
    if (fNatureza) p.set("natureza", fNatureza);
    p.set("page", String(page));
    try {
      const r = await fetch(`/api/protocolos?${p}`);
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar.");
      setRows(j.rows);
      setPages(j.pages);
      setResumo(j.resumo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [qDeb, fSituacao, fResp, fNatureza, page]);

  const carregarOpcoes = useCallback(async () => {
    try {
      const r = await fetch("/api/protocolos/opcoes");
      const j = await r.json();
      if (j.ok) {
        setAgrupado({ ...emptyAgrupado, ...j.agrupado });
        setOpcRows(j.rows);
      }
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);
  useEffect(() => {
    carregarOpcoes();
  }, [carregarOpcoes]);

  // Adiciona uma opção nova a uma categoria e retorna o valor (ou null).
  async function novaOpcao(categoria: Cat): Promise<string | null> {
    const valor = window.prompt(`Nova opção para ${CAT_LABEL[categoria]}:`)?.trim();
    if (!valor) return null;
    try {
      const r = await fetch("/api/protocolos/opcoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoria, valor }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro.");
      await carregarOpcoes();
      return j.valor as string;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao adicionar opção.");
      return null;
    }
  }

  async function removerOpcao(id: number) {
    if (!confirm("Remover esta opção da lista?")) return;
    await fetch(`/api/protocolos/opcoes/${id}`, { method: "DELETE" });
    await carregarOpcoes();
  }

  function abrirNovo() {
    setDraft(vazio);
    setEditando("novo");
  }
  function abrirEdicao(r: Row) {
    setDraft({
      data: r.data ?? "",
      numero: r.numero,
      secretaria: r.secretaria ?? "",
      natureza: r.natureza ?? "",
      responsavel: r.responsavel ?? "",
      situacao: r.situacao,
      distribuicao: r.distribuicao ?? "",
    });
    setEditando(r.id);
  }
  const cancelar = () => {
    setEditando(null);
    setDraft(vazio);
  };
  const setCampo = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  async function salvar() {
    if (!draft.numero.trim()) {
      alert("Informe o número do protocolo.");
      return;
    }
    setSalvando(true);
    const body = {
      data: draft.data || null,
      numero: draft.numero.trim(),
      secretaria: draft.secretaria || null,
      natureza: draft.natureza || null,
      responsavel: draft.responsavel || null,
      situacao: draft.situacao,
      distribuicao: draft.distribuicao || null,
    };
    try {
      const url = editando === "novo" ? "/api/protocolos" : `/api/protocolos/${editando}`;
      const r = await fetch(url, {
        method: editando === "novo" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  async function excluir(r: Row) {
    if (!confirm(`Excluir o protocolo ${r.numero}?`)) return;
    try {
      const res = await fetch(`/api/protocolos/${r.id}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao excluir.");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  const kpis = [
    { label: "Total", valor: resumo?.total ?? 0, cls: "text-slate-800 dark:text-white" },
    { label: "Em aberto", valor: resumo?.emAberto ?? 0, cls: "text-sky-600 dark:text-sky-400" },
    { label: "Em análise", valor: resumo?.porSituacao?.em_analise ?? 0, cls: "text-amber-600 dark:text-amber-400" },
    { label: "Finalizados", valor: resumo?.finalizados ?? 0, cls: "text-emerald-600 dark:text-emerald-400" },
  ];

  const totalCols = podeEditar ? 8 : 7;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">{k.label}</div>
            <div className={`mt-1 text-2xl font-bold tabular-nums ${k.cls}`}>{k.valor}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:min-w-[200px]">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..." className={`${filtro} pl-9`} />
        </div>
        <select value={fSituacao} onChange={(e) => setFSituacao(e.target.value)} className={`${filtro} sm:w-auto`}>
          <option value="">Todas as situações</option>
          {SITUACAO.map((s) => <option key={s} value={s}>{situacaoLabel(s)}</option>)}
        </select>
        <select value={fResp} onChange={(e) => setFResp(e.target.value)} className={`${filtro} sm:w-auto`}>
          <option value="">Todos os responsáveis</option>
          {agrupado.responsavel.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={fNatureza} onChange={(e) => setFNatureza(e.target.value)} className={`${filtro} sm:w-auto`}>
          <option value="">Todas as naturezas</option>
          {agrupado.natureza.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        {podeEditar && (
          <div className="flex gap-2 sm:ml-auto">
            <button type="button" onClick={() => setGerAberto(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
              Gerenciar listas
            </button>
            <button type="button" onClick={abrirNovo} disabled={editando === "novo"} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              + Adicionar linha
            </button>
          </div>
        )}
      </div>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{erro}</div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <th className="px-3 py-2.5 font-semibold">Data</th>
              <th className="px-3 py-2.5 font-semibold">Protocolo</th>
              <th className="px-3 py-2.5 font-semibold">Secretaria / Órgão</th>
              <th className="px-3 py-2.5 font-semibold">Natureza</th>
              <th className="px-3 py-2.5 font-semibold">Responsável</th>
              <th className="px-3 py-2.5 font-semibold">Situação</th>
              <th className="px-3 py-2.5 font-semibold">Distribuição</th>
              {podeEditar && <th className="px-3 py-2.5 text-right font-semibold">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {editando === "novo" && (
              <LinhaEdicao
                draft={draft}
                setCampo={setCampo}
                agrupado={agrupado}
                novaOpcao={novaOpcao}
                salvar={salvar}
                cancelar={cancelar}
                salvando={salvando}
                destaque
              />
            )}
            {loading && rows.length === 0 ? (
              <tr><td colSpan={totalCols} className="px-3 py-12 text-center text-slate-400"><IconSpinner className="mx-auto h-6 w-6" /></td></tr>
            ) : rows.length === 0 && editando !== "novo" ? (
              <tr><td colSpan={totalCols} className="px-3 py-12 text-center text-slate-400">Nenhum protocolo. {podeEditar && 'Use "+ Adicionar linha".'}</td></tr>
            ) : (
              rows.map((r) =>
                editando === r.id ? (
                  <LinhaEdicao
                    key={r.id}
                    draft={draft}
                    setCampo={setCampo}
                    agrupado={agrupado}
                    novaOpcao={novaOpcao}
                    salvar={salvar}
                    cancelar={cancelar}
                    salvando={salvando}
                  />
                ) : (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40">
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums dark:text-slate-400">{dataBR(r.data)}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-800 tabular-nums dark:text-slate-100">{r.numero}</td>
                    <td className="max-w-[280px] px-3 py-2.5"><span className="block truncate text-slate-700 dark:text-slate-200" title={r.secretaria ?? ""}>{r.secretaria ?? "—"}</span></td>
                    <td className="px-3 py-2.5">{r.natureza ? <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${naturezaStyle(r.natureza)}`}>{r.natureza}</span> : "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{r.responsavel ?? "—"}</td>
                    <td className="px-3 py-2.5"><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${situacaoStyle(r.situacao)}`}>{situacaoLabel(r.situacao)}</span></td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{r.distribuicao ?? "—"}</td>
                    {podeEditar && (
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" onClick={() => abrirEdicao(r)} disabled={editando !== null} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 dark:text-emerald-400 dark:hover:bg-emerald-500/10">Editar</button>
                          <button type="button" onClick={() => excluir(r)} disabled={editando !== null} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-500/10">Excluir</button>
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

      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-500 dark:text-slate-400">{loading ? "Carregando..." : `${rows.length} de ${resumo?.total ?? 0} protocolo(s)`}</span>
        <div className="flex items-center gap-1">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 enabled:hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"><IconChevronLeft className="h-4 w-4" /></button>
          <span className="px-2 tabular-nums text-slate-500 dark:text-slate-400">{page} / {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 enabled:hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"><IconChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {gerAberto && (
        <GerenciarListas
          opcRows={opcRows}
          onFechar={() => setGerAberto(false)}
          onAdicionar={novaOpcao}
          onRemover={removerOpcao}
        />
      )}
    </div>
  );
}

/* ----------------------------- Linha editável ----------------------------- */

function CelulaSelect({
  categoria,
  agrupado,
  value,
  onChange,
  novaOpcao,
}: {
  categoria: Cat;
  agrupado: Agrupado;
  value: string;
  onChange: (v: string) => void;
  novaOpcao: (c: Cat) => Promise<string | null>;
}) {
  const base = agrupado[categoria] ?? [];
  const lista = value && !base.includes(value) ? [value, ...base] : base;
  return (
    <select
      className={cellInput}
      value={value}
      onChange={async (e) => {
        const v = e.target.value;
        if (v === "__novo__") {
          const nova = await novaOpcao(categoria);
          if (nova) onChange(nova);
        } else onChange(v);
      }}
    >
      <option value="">—</option>
      {lista.map((o) => <option key={o} value={o}>{o}</option>)}
      <option value="__novo__">➕ Nova opção…</option>
    </select>
  );
}

function LinhaEdicao({
  draft,
  setCampo,
  agrupado,
  novaOpcao,
  salvar,
  cancelar,
  salvando,
  destaque,
}: {
  draft: Draft;
  setCampo: (k: keyof Draft, v: string) => void;
  agrupado: Agrupado;
  novaOpcao: (c: Cat) => Promise<string | null>;
  salvar: () => void;
  cancelar: () => void;
  salvando: boolean;
  destaque?: boolean;
}) {
  return (
    <tr className={`border-b border-slate-100 dark:border-slate-800/60 ${destaque ? "bg-emerald-50/50 dark:bg-emerald-500/5" : "bg-slate-50 dark:bg-slate-800/30"}`}>
      <td className="px-2 py-2"><input type="date" className={cellInput} value={draft.data} onChange={(e) => setCampo("data", e.target.value)} /></td>
      <td className="px-2 py-2"><input className={cellInput} value={draft.numero} onChange={(e) => setCampo("numero", e.target.value)} placeholder="Nº *" /></td>
      <td className="px-2 py-2"><CelulaSelect categoria="secretaria" agrupado={agrupado} value={draft.secretaria} onChange={(v) => setCampo("secretaria", v)} novaOpcao={novaOpcao} /></td>
      <td className="px-2 py-2"><CelulaSelect categoria="natureza" agrupado={agrupado} value={draft.natureza} onChange={(v) => setCampo("natureza", v)} novaOpcao={novaOpcao} /></td>
      <td className="px-2 py-2"><CelulaSelect categoria="responsavel" agrupado={agrupado} value={draft.responsavel} onChange={(v) => setCampo("responsavel", v)} novaOpcao={novaOpcao} /></td>
      <td className="px-2 py-2">
        <select className={cellInput} value={draft.situacao} onChange={(e) => setCampo("situacao", e.target.value)}>
          {SITUACAO.map((s) => <option key={s} value={s}>{situacaoLabel(s)}</option>)}
        </select>
      </td>
      <td className="px-2 py-2"><CelulaSelect categoria="distribuicao" agrupado={agrupado} value={draft.distribuicao} onChange={(v) => setCampo("distribuicao", v)} novaOpcao={novaOpcao} /></td>
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

/* --------------------------- Gerenciar listas ----------------------------- */

function GerenciarListas({
  opcRows,
  onFechar,
  onAdicionar,
  onRemover,
}: {
  opcRows: OpcaoRow[];
  onFechar: () => void;
  onAdicionar: (c: Cat) => Promise<string | null>;
  onRemover: (id: number) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 dark:text-white">Gerenciar listas de seleção</h3>
          <button type="button" onClick={onFechar} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar"><IconClose className="h-5 w-5" /></button>
        </div>
        <div className="space-y-5">
          {CATS.map((c) => {
            const itens = opcRows.filter((o) => o.categoria === c);
            return (
              <div key={c}>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{CAT_LABEL[c]}</h4>
                  <button type="button" onClick={() => onAdicionar(c)} className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400">+ adicionar</button>
                </div>
                {itens.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhuma opção cadastrada.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {itens.map((o) => (
                      <span key={o.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {o.valor}
                        <button type="button" onClick={() => onRemover(o.id)} className="text-slate-400 hover:text-red-600" aria-label="Remover"><IconClose className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
