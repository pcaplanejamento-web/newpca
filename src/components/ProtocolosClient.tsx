"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { dataBR } from "@/lib/format";
import {
  NATUREZA_SUGESTOES,
  SITUACAO,
  naturezaStyle,
  situacaoLabel,
  situacaoStyle,
} from "@/lib/protocolo-constantes";
import {
  IconAlert,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconSearch,
  IconSpinner,
} from "./icons";

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
type Opcoes = { responsaveis: string[]; naturezas: string[]; distribuicoes: string[] };

const vazio = {
  data: "",
  numero: "",
  secretaria: "",
  natureza: "",
  responsavel: "",
  situacao: "em_analise",
  distribuicao: "",
};
type Form = typeof vazio;

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-emerald-500/20";

export function ProtocolosClient({ podeEditar }: { podeEditar: boolean }) {
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [fSituacao, setFSituacao] = useState("");
  const [fResp, setFResp] = useState("");
  const [fNatureza, setFNatureza] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<Row[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [opcoes, setOpcoes] = useState<Opcoes>({ responsaveis: [], naturezas: [], distribuicoes: [] });
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [aberto, setAberto] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(vazio);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

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
      setOpcoes(j.opcoes ?? { responsaveis: [], naturezas: [], distribuicoes: [] });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [qDeb, fSituacao, fResp, fNatureza, page]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function novo() {
    setEditId(null);
    setForm(vazio);
    setErroForm(null);
    setAberto(true);
  }
  function editar(r: Row) {
    setEditId(r.id);
    setForm({
      data: r.data ?? "",
      numero: r.numero,
      secretaria: r.secretaria ?? "",
      natureza: r.natureza ?? "",
      responsavel: r.responsavel ?? "",
      situacao: r.situacao,
      distribuicao: r.distribuicao ?? "",
    });
    setErroForm(null);
    setAberto(true);
  }
  const campo = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErroForm(null);
    const body = {
      data: form.data || null,
      numero: form.numero,
      secretaria: form.secretaria || null,
      natureza: form.natureza || null,
      responsavel: form.responsavel || null,
      situacao: form.situacao,
      distribuicao: form.distribuicao || null,
    };
    try {
      const r = await fetch(editId ? `/api/protocolos/${editId}` : "/api/protocolos", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      setAberto(false);
      await carregar();
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(r: Row) {
    if (!confirm(`Excluir o protocolo ${r.numero}? Esta ação não pode ser desfeita.`)) return;
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
        <div className="relative flex-1 sm:min-w-[220px]">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por protocolo, secretaria, natureza..." className={`${inputCls} pl-9`} />
        </div>
        <select value={fSituacao} onChange={(e) => setFSituacao(e.target.value)} className={`${inputCls} sm:w-auto`}>
          <option value="">Todas as situações</option>
          {SITUACAO.map((s) => (
            <option key={s} value={s}>{situacaoLabel(s)}</option>
          ))}
        </select>
        <select value={fResp} onChange={(e) => setFResp(e.target.value)} className={`${inputCls} sm:w-auto`}>
          <option value="">Todos os responsáveis</option>
          {opcoes.responsaveis.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <select value={fNatureza} onChange={(e) => setFNatureza(e.target.value)} className={`${inputCls} sm:w-auto`}>
          <option value="">Todas as naturezas</option>
          {opcoes.naturezas.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        {podeEditar && (
          <button type="button" onClick={novo} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 sm:ml-auto">
            + Novo protocolo
          </button>
        )}
      </div>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{erro}</div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[920px] border-collapse text-sm">
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
            {loading && rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-12 text-center text-slate-400"><IconSpinner className="mx-auto h-6 w-6" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-12 text-center text-slate-400">Nenhum protocolo encontrado.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40">
                  <td className="px-3 py-2.5 text-slate-500 tabular-nums dark:text-slate-400">{dataBR(r.data)}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-800 tabular-nums dark:text-slate-100">{r.numero}</td>
                  <td className="max-w-[300px] px-3 py-2.5">
                    <span className="block truncate text-slate-700 dark:text-slate-200" title={r.secretaria ?? ""}>{r.secretaria ?? "—"}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    {r.natureza ? (
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${naturezaStyle(r.natureza)}`}>{r.natureza}</span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{r.responsavel ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${situacaoStyle(r.situacao)}`}>{situacaoLabel(r.situacao)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{r.distribuicao ?? "—"}</td>
                  {podeEditar && (
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" onClick={() => editar(r)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10">Editar</button>
                        <button type="button" onClick={() => excluir(r)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">Excluir</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
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

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <form onSubmit={salvar} className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 dark:text-white">{editId ? "Editar protocolo" : "Novo protocolo"}</h3>
              <button type="button" onClick={() => setAberto(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar"><IconClose className="h-5 w-5" /></button>
            </div>

            <datalist id="lst-responsaveis">{opcoes.responsaveis.map((v) => <option key={v} value={v} />)}</datalist>
            <datalist id="lst-distribuicoes">{opcoes.distribuicoes.map((v) => <option key={v} value={v} />)}</datalist>
            <datalist id="lst-naturezas">{[...new Set([...NATUREZA_SUGESTOES, ...opcoes.naturezas])].map((v) => <option key={v} value={v} />)}</datalist>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Data</span>
                <input type="date" className={inputCls} value={form.data} onChange={(e) => campo("data", e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Protocolo *</span>
                <input className={inputCls} value={form.numero} onChange={(e) => campo("numero", e.target.value)} required />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Secretaria / Órgão</span>
                <input className={inputCls} value={form.secretaria} onChange={(e) => campo("secretaria", e.target.value)} placeholder="Ex.: SMIR - SECRETARIA DE INFRAESTRUTURA RURAL" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Natureza</span>
                <input className={inputCls} list="lst-naturezas" value={form.natureza} onChange={(e) => campo("natureza", e.target.value)} placeholder="INCLUSÃO 2027 / EXCLUSÃO..." />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Situação</span>
                <select className={inputCls} value={form.situacao} onChange={(e) => campo("situacao", e.target.value)}>
                  {SITUACAO.map((s) => <option key={s} value={s}>{situacaoLabel(s)}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Responsável</span>
                <input className={inputCls} list="lst-responsaveis" value={form.responsavel} onChange={(e) => campo("responsavel", e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Distribuição</span>
                <input className={inputCls} list="lst-distribuicoes" value={form.distribuicao} onChange={(e) => campo("distribuicao", e.target.value)} />
              </label>
            </div>

            {erroForm && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />{erroForm}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Cancelar</button>
              <button type="submit" disabled={salvando} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {salvando && <IconSpinner className="h-4 w-4" />}{editId ? "Salvar" : "Criar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
