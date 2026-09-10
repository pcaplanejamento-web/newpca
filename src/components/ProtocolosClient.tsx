"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { dataBR } from "@/lib/format";
import {
  PRIORIDADE_LABEL,
  PRIORIDADE_PROTOCOLO,
  PRIORIDADE_STYLE,
  STATUS_LABEL,
  STATUS_PROTOCOLO,
  STATUS_STYLE,
  type PrioridadeProtocolo,
  type StatusProtocolo,
} from "@/lib/protocolo-constantes";
import {
  IconAlert,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconSearch,
  IconSpinner,
} from "./icons";

type Usuario = { id: number; nome: string };
type Row = {
  id: number;
  numero: string;
  assunto: string;
  secretaria: string | null;
  status: StatusProtocolo;
  prioridade: PrioridadeProtocolo;
  dataEntrada: string | null;
  prazo: string | null;
  dataConclusao: string | null;
  observacoes: string | null;
  responsavelId: number | null;
  responsavelNome: string | null;
};
type Resumo = {
  total: number;
  emAberto: number;
  vencidos: number;
  porStatus: Record<string, number>;
};

const vazio = {
  numero: "",
  assunto: "",
  secretaria: "",
  responsavelId: "",
  status: "recebido" as StatusProtocolo,
  prioridade: "media" as PrioridadeProtocolo,
  dataEntrada: "",
  prazo: "",
  dataConclusao: "",
  observacoes: "",
};
type Form = typeof vazio;

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-emerald-500/20";

export function ProtocolosClient({
  usuarios,
  podeEditar,
}: {
  usuarios: Usuario[];
  podeEditar: boolean;
}) {
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fResp, setFResp] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<Row[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
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
  useEffect(() => setPage(1), [qDeb, fStatus, fResp]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    const p = new URLSearchParams();
    if (qDeb.trim()) p.set("q", qDeb.trim());
    if (fStatus) p.set("status", fStatus);
    if (fResp) p.set("responsavel", fResp);
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
  }, [qDeb, fStatus, fResp, page]);

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
      numero: r.numero,
      assunto: r.assunto,
      secretaria: r.secretaria ?? "",
      responsavelId: r.responsavelId ? String(r.responsavelId) : "",
      status: r.status,
      prioridade: r.prioridade,
      dataEntrada: r.dataEntrada ?? "",
      prazo: r.prazo ?? "",
      dataConclusao: r.dataConclusao ?? "",
      observacoes: r.observacoes ?? "",
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
      numero: form.numero,
      assunto: form.assunto,
      secretaria: form.secretaria || null,
      responsavelId: form.responsavelId ? Number(form.responsavelId) : null,
      status: form.status,
      prioridade: form.prioridade,
      dataEntrada: form.dataEntrada || null,
      prazo: form.prazo || null,
      dataConclusao: form.dataConclusao || null,
      observacoes: form.observacoes || null,
    };
    try {
      const r = await fetch(
        editId ? `/api/protocolos/${editId}` : "/api/protocolos",
        {
          method: editId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
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
    if (!confirm(`Excluir o protocolo ${r.numero}? Esta ação não pode ser desfeita.`))
      return;
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
    { label: "Vencidos", valor: resumo?.vencidos ?? 0, cls: "text-red-600 dark:text-red-400" },
    { label: "Concluídos", valor: resumo?.porStatus?.concluido ?? 0, cls: "text-emerald-600 dark:text-emerald-400" },
  ];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400">{k.label}</div>
            <div className={`mt-1 text-2xl font-bold tabular-nums ${k.cls}`}>
              {k.valor}
            </div>
          </div>
        ))}
      </div>

      {/* Filtros + Novo */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:min-w-[220px]">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por número, assunto, secretaria..."
            className={`${inputCls} pl-9`}
          />
        </div>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={`${inputCls} sm:w-auto`}>
          <option value="">Todos os status</option>
          {STATUS_PROTOCOLO.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select value={fResp} onChange={(e) => setFResp(e.target.value)} className={`${inputCls} sm:w-auto`}>
          <option value="">Todos os responsáveis</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </select>
        {podeEditar && (
          <button
            type="button"
            onClick={novo}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 sm:ml-auto"
          >
            + Novo protocolo
          </button>
        )}
      </div>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {erro}
        </div>
      )}

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <th className="px-3 py-2.5 font-semibold">Número</th>
              <th className="px-3 py-2.5 font-semibold">Assunto</th>
              <th className="px-3 py-2.5 font-semibold">Secretaria</th>
              <th className="px-3 py-2.5 font-semibold">Responsável</th>
              <th className="px-3 py-2.5 font-semibold">Prioridade</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Prazo</th>
              {podeEditar && <th className="px-3 py-2.5 text-right font-semibold">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-slate-400">
                  <IconSpinner className="mx-auto h-6 w-6" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-slate-400">
                  Nenhum protocolo encontrado.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const vencido =
                  r.prazo &&
                  r.prazo < new Date().toISOString().slice(0, 10) &&
                  r.status !== "concluido" &&
                  r.status !== "arquivado";
                return (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-2.5 font-medium text-slate-800 tabular-nums dark:text-slate-100">
                      {r.numero}
                    </td>
                    <td className="max-w-[280px] px-3 py-2.5">
                      <span className="block truncate text-slate-700 dark:text-slate-200" title={r.assunto}>
                        {r.assunto}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">
                      {r.secretaria ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">
                      {r.responsavelNome ?? "—"}
                    </td>
                    <td className={`px-3 py-2.5 font-medium ${PRIORIDADE_STYLE[r.prioridade]}`}>
                      {PRIORIDADE_LABEL[r.prioridade]}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 tabular-nums ${vencido ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
                      {dataBR(r.prazo)}
                    </td>
                    {podeEditar && (
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => editar(r)}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => excluir(r)}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-500 dark:text-slate-400">
          {loading ? "Carregando..." : `${rows.length} de ${resumo?.total ?? 0} protocolo(s)`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 enabled:hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
          >
            <IconChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 tabular-nums text-slate-500 dark:text-slate-400">
            {page} / {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 enabled:hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
          >
            <IconChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Modal criar/editar */}
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <form
            onSubmit={salvar}
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl dark:bg-slate-900"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 dark:text-white">
                {editId ? "Editar protocolo" : "Novo protocolo"}
              </h3>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Fechar"
              >
                <IconClose className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Número *</span>
                <input className={inputCls} value={form.numero} onChange={(e) => campo("numero", e.target.value)} required />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Secretaria</span>
                <input className={inputCls} value={form.secretaria} onChange={(e) => campo("secretaria", e.target.value)} />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Assunto *</span>
                <input className={inputCls} value={form.assunto} onChange={(e) => campo("assunto", e.target.value)} required />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Responsável</span>
                <select className={inputCls} value={form.responsavelId} onChange={(e) => campo("responsavelId", e.target.value)}>
                  <option value="">— não atribuído —</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Prioridade</span>
                <select className={inputCls} value={form.prioridade} onChange={(e) => campo("prioridade", e.target.value)}>
                  {PRIORIDADE_PROTOCOLO.map((p) => (
                    <option key={p} value={p}>
                      {PRIORIDADE_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Status</span>
                <select className={inputCls} value={form.status} onChange={(e) => campo("status", e.target.value)}>
                  {STATUS_PROTOCOLO.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Entrada</span>
                <input type="date" className={inputCls} value={form.dataEntrada} onChange={(e) => campo("dataEntrada", e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Prazo</span>
                <input type="date" className={inputCls} value={form.prazo} onChange={(e) => campo("prazo", e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Conclusão</span>
                <input type="date" className={inputCls} value={form.dataConclusao} onChange={(e) => campo("dataConclusao", e.target.value)} />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Observações</span>
                <textarea className={`${inputCls} min-h-[72px]`} value={form.observacoes} onChange={(e) => campo("observacoes", e.target.value)} />
              </label>
            </div>

            {erroForm && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {erroForm}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {salvando && <IconSpinner className="h-4 w-4" />}
                {editId ? "Salvar" : "Criar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
