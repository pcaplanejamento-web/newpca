"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "./Avatar";
import { Badge, naturezaTone, situacaoTone } from "./Badge";
import { Fab } from "./Fab";
import { ProtocoloCard } from "./ProtocoloCard";
import {
  IconAlert,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconInbox,
  IconPencil,
  IconPlus,
  IconSpinner,
  IconTrash,
} from "./icons";
import { dataBR } from "@/lib/format";
import type { OpcoesPorCampo, ProtocoloLista, ResumoProtocolos } from "@/lib/protocolos";
import type { CampoOpcao, SituacaoProtocolo } from "@/db/schema";

type SituacaoOpcao = { valor: SituacaoProtocolo; label: string };
type Filtros = { natureza: string; situacao: string; responsavel: string; ano: string };
type Pagina = { rows: ProtocoloLista[]; total: number; page: number; pageSize: number; pages: number };
type Draft = {
  numero: string;
  data: string;
  orgao: string;
  orgaoSigla: string;
  natureza: string;
  responsavel: string;
  situacao: SituacaoProtocolo;
  distribuicao: string;
};

const inp =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-emerald-500/20";
const filtroCls =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:focus:ring-emerald-500/20";
const labelEd = "mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400";

const hoje = () => new Date().toISOString().slice(0, 10);
function draftDe(p?: ProtocoloLista | null): Draft {
  return {
    numero: p?.numero ?? "",
    data: p?.data ?? hoje(),
    orgao: p?.orgao ?? "",
    orgaoSigla: p?.orgaoSigla ?? "",
    natureza: p?.natureza ?? "",
    responsavel: p?.responsavel ?? "",
    situacao: p?.situacao ?? "em_analise",
    distribuicao: p?.distribuicao ?? "",
  };
}

/** <select> de opção gerenciável + "+ Nova opção…" inline (prompt). */
function CampoSelecao({
  value,
  opcoes,
  onChange,
  onAdd,
  placeholder = "—",
}: {
  value: string;
  opcoes: string[];
  onChange: (v: string) => void;
  onAdd: (v: string) => Promise<void>;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={async (e) => {
        const v = e.target.value;
        if (v === "__nova__") {
          const nova = window.prompt("Nova opção:")?.trim();
          if (nova) {
            await onAdd(nova);
            onChange(nova);
          }
        } else onChange(v);
      }}
      className={inp}
    >
      <option value="">{placeholder}</option>
      {opcoes.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      {value && !opcoes.includes(value) && <option value={value}>{value}</option>}
      <option value="__nova__">+ Nova opção…</option>
    </select>
  );
}

// Props compartilhadas pelos editores inline (desktop <tr> e card mobile).
type EdicaoProps = {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  situacoes: SituacaoOpcao[];
  opcoes: OpcoesPorCampo;
  adicionarOpcao: (campo: CampoOpcao, valor: string) => Promise<void>;
  onSalvar: () => void;
  onCancelar: () => void;
  salvando: boolean;
  erro: string | null;
};

function SelSituacao({
  value,
  situacoes,
  onChange,
}: {
  value: SituacaoProtocolo;
  situacoes: SituacaoOpcao[];
  onChange: (v: SituacaoProtocolo) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as SituacaoProtocolo)} className={inp}>
      {situacoes.map((s) => (
        <option key={s.valor} value={s.valor}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

/** Linha editável (desktop). Componente estável para não perder o foco ao digitar. */
function LinhaEdicaoDesktop({ draft, set, situacoes, opcoes, adicionarOpcao, onSalvar, onCancelar, salvando, erro }: EdicaoProps) {
  return (
    <tr className="bg-emerald-50/40 align-top dark:bg-emerald-500/5">
      <td className="px-4 py-2">
        <input type="date" value={draft.data} onChange={(e) => set({ data: e.target.value })} className={inp} />
      </td>
      <td className="px-4 py-2">
        <input value={draft.numero} onChange={(e) => set({ numero: e.target.value })} placeholder="Nº *" className={inp} />
        {erro && <span className="mt-1 block text-[11px] text-red-600 dark:text-red-400">{erro}</span>}
      </td>
      <td className="px-4 py-2">
        <div className="space-y-1">
          <CampoSelecao value={draft.orgao} opcoes={opcoes.orgao} onChange={(v) => set({ orgao: v })} onAdd={(v) => adicionarOpcao("orgao", v)} />
          <input value={draft.orgaoSigla} onChange={(e) => set({ orgaoSigla: e.target.value })} placeholder="Sigla" className={inp} />
        </div>
      </td>
      <td className="px-4 py-2">
        <CampoSelecao value={draft.natureza} opcoes={opcoes.natureza} onChange={(v) => set({ natureza: v })} onAdd={(v) => adicionarOpcao("natureza", v)} />
      </td>
      <td className="px-4 py-2">
        <CampoSelecao value={draft.responsavel} opcoes={opcoes.responsavel} onChange={(v) => set({ responsavel: v })} onAdd={(v) => adicionarOpcao("responsavel", v)} />
      </td>
      <td className="px-4 py-2">
        <SelSituacao value={draft.situacao} situacoes={situacoes} onChange={(v) => set({ situacao: v })} />
      </td>
      <td className="px-4 py-2">
        <CampoSelecao value={draft.distribuicao} opcoes={opcoes.distribuicao} onChange={(v) => set({ distribuicao: v })} onAdd={(v) => adicionarOpcao("distribuicao", v)} />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={onSalvar} disabled={salvando} aria-label="Salvar" className="rounded-md bg-emerald-600 p-1.5 text-white transition hover:bg-emerald-700 disabled:opacity-60">
            {salvando ? <IconSpinner className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />}
          </button>
          <button type="button" onClick={onCancelar} disabled={salvando} aria-label="Cancelar" className="rounded-md border border-slate-300 p-1.5 text-slate-500 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-800">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/** Card editável (mobile). Componente estável para não perder o foco ao digitar. */
function CardEdicaoMobile({ draft, set, situacoes, opcoes, adicionarOpcao, onSalvar, onCancelar, salvando, erro }: EdicaoProps) {
  return (
    <div className="rounded-2xl border border-emerald-300 bg-white p-4 shadow-sm dark:border-emerald-500/40 dark:bg-slate-900">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelEd}>Protocolo *</label>
          <input value={draft.numero} onChange={(e) => set({ numero: e.target.value })} placeholder="Número" className={inp} />
        </div>
        <div>
          <label className={labelEd}>Data</label>
          <input type="date" value={draft.data} onChange={(e) => set({ data: e.target.value })} className={inp} />
        </div>
        <div>
          <label className={labelEd}>Situação</label>
          <SelSituacao value={draft.situacao} situacoes={situacoes} onChange={(v) => set({ situacao: v })} />
        </div>
        <div className="col-span-2">
          <label className={labelEd}>Secretaria / Órgão</label>
          <CampoSelecao value={draft.orgao} opcoes={opcoes.orgao} onChange={(v) => set({ orgao: v })} onAdd={(v) => adicionarOpcao("orgao", v)} />
        </div>
        <div>
          <label className={labelEd}>Sigla</label>
          <input value={draft.orgaoSigla} onChange={(e) => set({ orgaoSigla: e.target.value })} className={inp} />
        </div>
        <div>
          <label className={labelEd}>Natureza</label>
          <CampoSelecao value={draft.natureza} opcoes={opcoes.natureza} onChange={(v) => set({ natureza: v })} onAdd={(v) => adicionarOpcao("natureza", v)} />
        </div>
        <div>
          <label className={labelEd}>Responsável</label>
          <CampoSelecao value={draft.responsavel} opcoes={opcoes.responsavel} onChange={(v) => set({ responsavel: v })} onAdd={(v) => adicionarOpcao("responsavel", v)} />
        </div>
        <div>
          <label className={labelEd}>Distribuição</label>
          <CampoSelecao value={draft.distribuicao} opcoes={opcoes.distribuicao} onChange={(v) => set({ distribuicao: v })} onAdd={(v) => adicionarOpcao("distribuicao", v)} />
        </div>
      </div>
      {erro && (
        <div className="mt-3 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
          <IconAlert className="h-4 w-4" /> {erro}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onSalvar} disabled={salvando} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
          {salvando ? <IconSpinner className="h-[18px] w-[18px]" /> : <IconCheck className="h-[18px] w-[18px]" />}
          Salvar
        </button>
        <button type="button" onClick={onCancelar} disabled={salvando} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
          Cancelar
        </button>
      </div>
    </div>
  );
}

const Th = ({ children }: { children: ReactNode }) => (
  <th className="whitespace-nowrap px-4 py-3 text-left font-semibold">{children}</th>
);

export function ProtocolosView({
  inicial,
  resumo: resumoInicial,
  opcoes: opcoesInicial,
  situacoes,
  anos = [],
  podeEditar,
  buscaInicial = "",
  situacaoInicial = "",
}: {
  inicial: Pagina;
  resumo: ResumoProtocolos;
  opcoes: OpcoesPorCampo;
  situacoes: SituacaoOpcao[];
  anos?: string[];
  podeEditar: boolean;
  buscaInicial?: string;
  situacaoInicial?: string;
}) {
  const [pagina, setPagina] = useState<Pagina>(inicial);
  const [resumo, setResumo] = useState(resumoInicial);
  const [opcoes, setOpcoes] = useState(opcoesInicial);
  const [filtros, setFiltros] = useState<Filtros>({
    natureza: "",
    situacao: situacaoInicial,
    responsavel: "",
    ano: "",
  });
  const [page, setPage] = useState(1);
  const [carregando, setCarregando] = useState(false);

  const [editId, setEditId] = useState<number | "novo" | null>(null);
  const [draft, setDraft] = useState<Draft>(draftDe());
  const [salvando, setSalvando] = useState(false);
  const [erroEdit, setErroEdit] = useState<string | null>(null);

  const buscaRef = useRef(buscaInicial);
  const pularPrimeira = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const labelSituacao = useCallback(
    (v: string) => situacoes.find((s) => s.valor === v)?.label ?? "—",
    [situacoes],
  );

  const carregar = useCallback(async (f: Filtros, pg: number) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setCarregando(true);
    try {
      const sp = new URLSearchParams();
      if (buscaRef.current.trim()) sp.set("q", buscaRef.current.trim());
      if (f.natureza) sp.set("natureza", f.natureza);
      if (f.situacao) sp.set("situacao", f.situacao);
      if (f.responsavel) sp.set("responsavel", f.responsavel);
      if (f.ano) sp.set("ano", f.ano);
      sp.set("page", String(pg));
      const res = await fetch(`/api/protocolos?${sp.toString()}`, { signal: ac.signal });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Erro");
      setPagina({ rows: json.rows, total: json.total, page: json.page, pageSize: json.pageSize, pages: json.pages });
      setResumo(json.resumo);
      setOpcoes(json.opcoes);
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error(e);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (pularPrimeira.current) {
      pularPrimeira.current = false;
      return;
    }
    const t = setTimeout(() => carregar(filtros, page), 200);
    return () => clearTimeout(t);
  }, [filtros, page, carregar]);

  const recarregar = useCallback(() => carregar(filtros, page), [carregar, filtros, page]);

  function mudarFiltro(patch: Partial<Filtros>) {
    setEditId(null); // evita linha em edição órfã ao filtrar
    setErroEdit(null);
    setFiltros((f) => ({ ...f, ...patch }));
    setPage(1);
  }

  function irParaPagina(alvo: number) {
    setEditId(null);
    setPage(alvo);
  }

  const adicionarOpcao = useCallback(async (campo: CampoOpcao, valor: string) => {
    try {
      const res = await fetch("/api/protocolos/opcoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campo, valor }),
      });
      if (!res.ok) return;
      setOpcoes((o) => ({ ...o, [campo]: o[campo].includes(valor) ? o[campo] : [...o[campo], valor] }));
    } catch {
      /* ignora */
    }
  }, []);

  const set = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), []);

  function iniciarNovo() {
    setEditId("novo");
    setDraft(draftDe());
    setErroEdit(null);
  }
  function iniciarEdicao(p: ProtocoloLista) {
    if (!podeEditar) return;
    setEditId(p.id);
    setDraft(draftDe(p));
    setErroEdit(null);
  }
  const cancelar = useCallback(() => {
    setEditId(null);
    setErroEdit(null);
  }, []);

  async function salvar() {
    if (!draft.numero.trim()) {
      setErroEdit("Informe o número do protocolo.");
      return;
    }
    setSalvando(true);
    setErroEdit(null);
    try {
      const novo = editId === "novo";
      const res = await fetch(novo ? "/api/protocolos" : `/api/protocolos/${editId}`, {
        method: novo ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Erro ao salvar.");
      setEditId(null);
      await recarregar();
    } catch (e) {
      setErroEdit(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(p: ProtocoloLista) {
    if (!confirm(`Excluir o protocolo ${p.numero}? Esta ação não pode ser desfeita.`)) return;
    const res = await fetch(`/api/protocolos/${p.id}`, { method: "DELETE" });
    if (res.ok) recarregar();
  }

  const filtrando = !!(filtros.natureza || filtros.situacao || filtros.responsavel || filtros.ano);
  const vazio = pagina.rows.length === 0 && editId !== "novo";

  const edProps: EdicaoProps = {
    draft,
    set,
    situacoes,
    opcoes,
    adicionarOpcao,
    onSalvar: salvar,
    onCancelar: cancelar,
    salvando,
    erro: erroEdit,
  };

  return (
    <div className="space-y-5">
      {/* Cabeçalho + contagem */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Protocolos</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {resumo.total} protocolo{resumo.total === 1 ? "" : "s"} · {resumo.emAnalise} em análise
          </p>
        </div>
        {podeEditar && (
          <button
            type="button"
            onClick={iniciarNovo}
            className="hidden items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 lg:inline-flex"
          >
            <IconPlus className="h-[18px] w-[18px]" />
            Novo protocolo
          </button>
        )}
      </div>

      {/* Filtros (Natureza · Situação · Responsável · Período) */}
      <div className="flex flex-wrap gap-2">
        <select value={filtros.natureza} onChange={(e) => mudarFiltro({ natureza: e.target.value })} className={filtroCls} aria-label="Filtrar por natureza">
          <option value="">Natureza</option>
          {opcoes.natureza.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select value={filtros.situacao} onChange={(e) => mudarFiltro({ situacao: e.target.value })} className={filtroCls} aria-label="Filtrar por situação">
          <option value="">Situação</option>
          {situacoes.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.label}
            </option>
          ))}
        </select>
        <select value={filtros.responsavel} onChange={(e) => mudarFiltro({ responsavel: e.target.value })} className={filtroCls} aria-label="Filtrar por responsável">
          <option value="">Responsável</option>
          {opcoes.responsavel.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select value={filtros.ano} onChange={(e) => mudarFiltro({ ano: e.target.value })} className={filtroCls} aria-label="Filtrar por período">
          <option value="">Período</option>
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {filtrando && (
          <button
            type="button"
            onClick={() => mudarFiltro({ natureza: "", situacao: "", responsavel: "", ano: "" })}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Limpar
          </button>
        )}
        {carregando && (
          <span className="inline-flex items-center gap-1.5 px-1 text-xs text-slate-400">
            <IconSpinner className="h-3.5 w-3.5" /> Atualizando…
          </span>
        )}
      </div>

      {vazio ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <IconInbox className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-800 dark:text-white">Nenhum protocolo encontrado</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {filtrando ? "Ajuste os filtros para ver mais resultados." : "Adicione o primeiro protocolo para começar."}
          </p>
          {podeEditar && (
            <button
              type="button"
              onClick={iniciarNovo}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              <IconPlus className="h-[18px] w-[18px]" /> Novo protocolo
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile: cards (edição inline no próprio card) */}
          <div className="space-y-3 lg:hidden">
            {editId === "novo" && <CardEdicaoMobile {...edProps} />}
            {pagina.rows.map((p) =>
              editId === p.id ? (
                <CardEdicaoMobile key={p.id} {...edProps} />
              ) : (
                <ProtocoloCard key={p.id} p={p} situacaoLabel={labelSituacao(p.situacao)} onClick={podeEditar ? () => iniciarEdicao(p) : undefined} />
              ),
            )}
          </div>

          {/* Desktop: tabela (edição inline na própria linha) */}
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <Th>Data</Th>
                  <Th>Protocolo</Th>
                  <Th>Órgão</Th>
                  <Th>Natureza</Th>
                  <Th>Responsável</Th>
                  <Th>Situação</Th>
                  <Th>Distribuição</Th>
                  {podeEditar && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {editId === "novo" && <LinhaEdicaoDesktop {...edProps} />}
                {pagina.rows.map((p) =>
                  editId === p.id ? (
                    <LinhaEdicaoDesktop key={p.id} {...edProps} />
                  ) : (
                    <tr key={p.id} className="group transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{p.data ? dataBR(p.data) : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-emerald-600 dark:text-emerald-400">{p.numero}</td>
                      <td className="max-w-[18rem] px-4 py-3">
                        <div className="truncate font-medium text-slate-700 dark:text-slate-200">{p.orgao ?? "—"}</div>
                        {p.orgaoSigla && <div className="text-xs text-slate-400">{p.orgaoSigla}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {p.natureza ? <Badge tone={naturezaTone(p.natureza)} dot>{p.natureza}</Badge> : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {p.responsavel ? (
                          <div className="flex items-center gap-2">
                            <Avatar nome={p.responsavel} size="sm" />
                            <span className="text-slate-700 dark:text-slate-200">{p.responsavel}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={situacaoTone(p.situacao)} dot>{labelSituacao(p.situacao)}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{p.distribuicao ?? "—"}</td>
                      {podeEditar && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                            <button type="button" aria-label="Editar" onClick={() => iniciarEdicao(p)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-slate-700">
                              <IconPencil className="h-4 w-4" />
                            </button>
                            <button type="button" aria-label="Excluir" onClick={() => excluir(p)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                              <IconTrash className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Paginação */}
      {pagina.pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1 || carregando}
            onClick={() => irParaPagina(Math.max(1, page - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <IconChevronLeft className="h-4 w-4" /> Anterior
          </button>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {pagina.page} / {pagina.pages}
          </span>
          <button
            type="button"
            disabled={page >= pagina.pages || carregando}
            onClick={() => irParaPagina(Math.min(pagina.pages, page + 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Próxima <IconChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* FAB (mobile) */}
      {podeEditar && editId === null && <Fab onClick={iniciarNovo} label="Novo" />}
    </div>
  );
}
