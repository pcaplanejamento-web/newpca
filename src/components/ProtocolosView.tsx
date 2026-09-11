"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { Badge, hashTone, situacaoTone } from "./Badge";
import { Fab } from "./Fab";
import { ProtocoloCard } from "./ProtocoloCard";
import { NovoProtocoloModal, type SituacaoOpcao } from "./NovoProtocoloModal";
import { StatCard } from "./StatCard";
import {
  IconActivity,
  IconAlert,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconFile,
  IconFilter,
  IconInbox,
  IconPencil,
  IconPlus,
  IconSearch,
  IconSpinner,
  IconTrash,
} from "./icons";
import { dataBR } from "@/lib/format";
import type { OpcoesPorCampo, ProtocoloLista, ResumoProtocolos } from "@/lib/protocolos";
import type { CampoOpcao } from "@/db/schema";

type Filtros = { q: string; situacao: string; natureza: string; responsavel: string };
type Pagina = { rows: ProtocoloLista[]; total: number; page: number; pageSize: number; pages: number };

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:ring-emerald-500/20";

export function ProtocolosView({
  inicial,
  resumo: resumoInicial,
  opcoes: opcoesInicial,
  situacoes,
  podeEditar,
  buscaInicial = "",
  situacaoInicial = "",
}: {
  inicial: Pagina;
  resumo: ResumoProtocolos;
  opcoes: OpcoesPorCampo;
  situacoes: SituacaoOpcao[];
  podeEditar: boolean;
  buscaInicial?: string;
  situacaoInicial?: string;
}) {
  const [pagina, setPagina] = useState<Pagina>(inicial);
  const [resumo, setResumo] = useState(resumoInicial);
  const [opcoes, setOpcoes] = useState(opcoesInicial);
  const [filtros, setFiltros] = useState<Filtros>({
    q: buscaInicial,
    situacao: situacaoInicial,
    natureza: "",
    responsavel: "",
  });
  const [page, setPage] = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [avancado, setAvancado] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<ProtocoloLista | null>(null);

  const pularPrimeira = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const labelSituacao = useCallback(
    (v: string) => situacoes.find((s) => s.valor === v)?.label ?? "—",
    [situacoes],
  );

  const carregar = useCallback(
    async (f: Filtros, pg: number) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setCarregando(true);
      try {
        const sp = new URLSearchParams();
        if (f.q.trim()) sp.set("q", f.q.trim());
        if (f.situacao) sp.set("situacao", f.situacao);
        if (f.natureza) sp.set("natureza", f.natureza);
        if (f.responsavel) sp.set("responsavel", f.responsavel);
        sp.set("page", String(pg));
        const res = await fetch(`/api/protocolos?${sp.toString()}`, { signal: ac.signal });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error ?? "Erro");
        setPagina({
          rows: json.rows,
          total: json.total,
          page: json.page,
          pageSize: json.pageSize,
          pages: json.pages,
        });
        setResumo(json.resumo);
        setOpcoes(json.opcoes);
      } catch (e) {
        if ((e as Error).name !== "AbortError") console.error(e);
      } finally {
        setCarregando(false);
      }
    },
    [],
  );

  // Refetch com debounce quando filtros/página mudam (pula a 1ª render: já temos os dados do servidor).
  useEffect(() => {
    if (pularPrimeira.current) {
      pularPrimeira.current = false;
      return;
    }
    const t = setTimeout(() => carregar(filtros, page), 250);
    return () => clearTimeout(t);
  }, [filtros, page, carregar]);

  function mudarFiltro(patch: Partial<Filtros>) {
    setFiltros((f) => ({ ...f, ...patch }));
    setPage(1);
  }

  const recarregar = useCallback(() => carregar(filtros, page), [carregar, filtros, page]);

  async function adicionarOpcao(campo: CampoOpcao, valor: string): Promise<boolean> {
    try {
      const res = await fetch("/api/protocolos/opcoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campo, valor }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) return false;
      setOpcoes((o) => ({
        ...o,
        [campo]: o[campo].includes(valor) ? o[campo] : [...o[campo], valor],
      }));
      return true;
    } catch {
      return false;
    }
  }

  async function excluir(p: ProtocoloLista) {
    if (!confirm(`Excluir o protocolo ${p.numero}? Esta ação não pode ser desfeita.`)) return;
    const res = await fetch(`/api/protocolos/${p.id}`, { method: "DELETE" });
    if (res.ok) recarregar();
  }

  function abrirNovo() {
    setEditando(null);
    setModalAberto(true);
  }
  function abrirEdicao(p: ProtocoloLista) {
    if (!podeEditar) return;
    setEditando(p);
    setModalAberto(true);
  }

  const stats = [
    { key: "", label: "Total", value: resumo.total, tone: "slate" as const, Icon: IconFile, mobile: true },
    { key: "em_analise", label: "Em análise", value: resumo.emAnalise, tone: "amber" as const, Icon: IconClock, mobile: true },
    { key: "em_andamento", label: "Em andamento", value: resumo.emAndamento, tone: "blue" as const, Icon: IconActivity, mobile: false },
    { key: "finalizado", label: "Finalizados", value: resumo.finalizado, tone: "emerald" as const, Icon: IconCheck, mobile: true },
    { key: "devolvido", label: "Devolvidos", value: resumo.devolvido, tone: "orange" as const, Icon: IconAlert, mobile: false },
  ];

  const chips = [{ valor: "", label: "Todos" }, ...situacoes];
  const vazio = pagina.rows.length === 0;

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Protocolos</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Distribuição e acompanhamento dos protocolos do PCA.
          </p>
        </div>
        {podeEditar && (
          <button
            type="button"
            onClick={abrirNovo}
            className="hidden items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 sm:inline-flex"
          >
            <IconPlus className="h-[18px] w-[18px]" />
            Novo protocolo
          </button>
        )}
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className={s.mobile ? "" : "hidden md:block"}>
            <StatCard
              label={s.label}
              value={s.value}
              tone={s.tone}
              icon={<s.Icon className="h-5 w-5" />}
              active={filtros.situacao === s.key}
              onClick={() => mudarFiltro({ situacao: s.key })}
            />
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={filtros.q}
              onChange={(e) => mudarFiltro({ q: e.target.value })}
              placeholder="Buscar por número ou órgão..."
              className={`${inputCls} pl-9`}
            />
          </div>
          <button
            type="button"
            onClick={() => setAvancado((v) => !v)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              avancado || filtros.natureza || filtros.responsavel
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <IconFilter className="h-4 w-4" />
            <span className="hidden sm:inline">Filtros</span>
          </button>
        </div>

        {/* Chips de situação (roláveis no mobile) */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {chips.map((c) => {
            const ativo = filtros.situacao === c.valor;
            return (
              <button
                key={c.valor || "todos"}
                type="button"
                onClick={() => mudarFiltro({ situacao: c.valor })}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  ativo
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Avançado */}
        {avancado && (
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-900/40">
            <select
              value={filtros.natureza}
              onChange={(e) => mudarFiltro({ natureza: e.target.value })}
              className={inputCls}
            >
              <option value="">Todas as naturezas</option>
              {opcoes.natureza.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <select
              value={filtros.responsavel}
              onChange={(e) => mudarFiltro({ responsavel: e.target.value })}
              className={inputCls}
            >
              <option value="">Todos os responsáveis</option>
              {opcoes.responsavel.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                setFiltros((f) => ({ ...f, natureza: "", responsavel: "" }))
              }
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {/* Contagem + carregando */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>
          {pagina.total} protocolo{pagina.total === 1 ? "" : "s"}
        </span>
        {carregando && (
          <span className="inline-flex items-center gap-1.5">
            <IconSpinner className="h-3.5 w-3.5" /> Atualizando...
          </span>
        )}
      </div>

      {/* Vazio */}
      {vazio ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <IconInbox className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-800 dark:text-white">
            Nenhum protocolo encontrado
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {filtros.q || filtros.situacao || filtros.natureza || filtros.responsavel
              ? "Ajuste os filtros para ver mais resultados."
              : "Cadastre o primeiro protocolo para começar."}
          </p>
          {podeEditar && (
            <button
              type="button"
              onClick={abrirNovo}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              <IconPlus className="h-[18px] w-[18px]" /> Novo protocolo
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Cards (mobile) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {pagina.rows.map((p) => (
              <ProtocoloCard
                key={p.id}
                p={p}
                situacaoLabel={labelSituacao(p.situacao)}
                onClick={podeEditar ? () => abrirEdicao(p) : undefined}
              />
            ))}
          </div>

          {/* Tabela (desktop) */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Protocolo</th>
                  <th className="px-4 py-3 font-semibold">Data</th>
                  <th className="px-4 py-3 font-semibold">Órgão</th>
                  <th className="px-4 py-3 font-semibold">Natureza</th>
                  <th className="px-4 py-3 font-semibold">Responsável</th>
                  <th className="px-4 py-3 font-semibold">Situação</th>
                  {podeEditar && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pagina.rows.map((p) => (
                  <tr
                    key={p.id}
                    className="group transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      {p.numero}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {p.data ? dataBR(p.data) : "—"}
                    </td>
                    <td className="max-w-[16rem] px-4 py-3">
                      <div className="truncate font-medium text-slate-700 dark:text-slate-200">
                        {p.orgao ?? "—"}
                      </div>
                      {p.orgaoSigla && (
                        <div className="text-xs text-slate-400">{p.orgaoSigla}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.natureza ? (
                        <Badge tone={hashTone(p.natureza)}>{p.natureza}</Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.responsavel ? (
                        <div className="flex items-center gap-2">
                          <Avatar nome={p.responsavel} size="sm" />
                          <span className="text-slate-700 dark:text-slate-200">
                            {p.responsavel}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={situacaoTone(p.situacao)} dot>
                        {labelSituacao(p.situacao)}
                      </Badge>
                    </td>
                    {podeEditar && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                          <button
                            type="button"
                            aria-label="Editar"
                            onClick={() => abrirEdicao(p)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-slate-700"
                          >
                            <IconPencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Excluir"
                            onClick={() => excluir(p)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                          >
                            <IconTrash className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
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
            onClick={() => setPage((p) => Math.max(1, p - 1))}
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
            onClick={() => setPage((p) => Math.min(pagina.pages, p + 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Próxima <IconChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* FAB (mobile) */}
      {podeEditar && <Fab onClick={abrirNovo} label="Novo" />}

      {/* Modal criar/editar */}
      <NovoProtocoloModal
        aberto={modalAberto}
        aoFechar={() => setModalAberto(false)}
        opcoes={opcoes}
        situacoes={situacoes}
        protocolo={editando}
        podeEditar={podeEditar}
        aoSalvar={recarregar}
        aoAdicionarOpcao={adicionarOpcao}
      />
    </div>
  );
}
