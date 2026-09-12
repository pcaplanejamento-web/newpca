"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Fab } from "./Fab";
import { cellCls as inp, filterCls as filtroCls, labelSmCls as labelEd } from "./formStyles";
import {
  IconAlert,
  IconCheck,
  IconClose,
  IconInbox,
  IconPencil,
  IconPlus,
  IconSpinner,
  IconTrash,
} from "./icons";
import { Pager } from "./Pager";
import { ProtocoloCard } from "./ProtocoloCard";
import { NaturezaTag, SituacaoDot } from "./StatusTag";
import { dataBR } from "@/lib/format";
import type { OpcoesPorCampo, ProtocoloLista, ResumoProtocolos } from "@/lib/protocolos";
import type { CampoOpcao, SituacaoProtocolo } from "@/db/schema";

type SituacaoOpcao = { valor: SituacaoProtocolo; label: string };
type RepOpcao = { id: number; codigo: string; nome: string };
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
  reparticoes: RepOpcao[];
  opcoes: OpcoesPorCampo;
  adicionarOpcao: (campo: CampoOpcao, valor: string) => Promise<void>;
  onSalvar: () => void;
  onCancelar: () => void;
  salvando: boolean;
  erro: string | null;
};

/** Órgão = REPARTIÇÃO (regra do sistema). Guarda nome em `orgao` e sigla em `orgaoSigla`. */
function SelReparticao({
  value,
  reparticoes,
  onChange,
}: {
  value: string; // sigla (código) da repartição selecionada
  reparticoes: RepOpcao[];
  onChange: (codigo: string, nome: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => {
        const codigo = e.target.value;
        const r = reparticoes.find((x) => x.codigo === codigo);
        onChange(codigo, r?.nome ?? "");
      }}
      className={inp}
      aria-label="Órgão (repartição)"
    >
      <option value="">—</option>
      {reparticoes.map((r) => (
        <option key={r.id} value={r.codigo}>
          {r.codigo} · {r.nome}
        </option>
      ))}
      {value && !reparticoes.some((r) => r.codigo === value) && <option value={value}>{value}</option>}
    </select>
  );
}

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
function LinhaEdicaoDesktop({ draft, set, situacoes, reparticoes, opcoes, adicionarOpcao, onSalvar, onCancelar, salvando, erro }: EdicaoProps) {
  return (
    <tr className="bg-accent-soft align-top">
      <td className="px-4 py-2">
        <input type="date" value={draft.data} onChange={(e) => set({ data: e.target.value })} className={inp} />
      </td>
      <td className="px-4 py-2">
        <input value={draft.numero} onChange={(e) => set({ numero: e.target.value })} placeholder="Nº *" className={inp} />
        {erro && <span className="mt-1 block text-[11px]" style={{ color: "var(--danger)" }}>{erro}</span>}
      </td>
      <td className="px-4 py-2">
        <SelReparticao value={draft.orgaoSigla} reparticoes={reparticoes} onChange={(codigo, nome) => set({ orgaoSigla: codigo, orgao: nome })} />
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
          <button type="button" onClick={onSalvar} disabled={salvando} aria-label="Salvar" className="rounded-control bg-text p-1.5 text-surface transition hover:opacity-90 disabled:opacity-60">
            {salvando ? <IconSpinner className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />}
          </button>
          <button type="button" onClick={onCancelar} disabled={salvando} aria-label="Cancelar" className="rounded-control border border-border-2 p-1.5 text-muted transition hover:bg-surface-2 disabled:opacity-60">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/** Card editável (mobile). Componente estável para não perder o foco ao digitar. */
function CardEdicaoMobile({ draft, set, situacoes, reparticoes, opcoes, adicionarOpcao, onSalvar, onCancelar, salvando, erro }: EdicaoProps) {
  return (
    <div className="rounded-card border border-accent bg-surface p-4 shadow-ring">
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
          <label className={labelEd}>Órgão (repartição)</label>
          <SelReparticao value={draft.orgaoSigla} reparticoes={reparticoes} onChange={(codigo, nome) => set({ orgaoSigla: codigo, orgao: nome })} />
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
        <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: "var(--danger)" }}>
          <IconAlert className="h-4 w-4" /> {erro}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <Button onClick={onSalvar} loading={salvando} icon={<IconCheck className="h-[18px] w-[18px]" />} className="flex-1">
          Salvar
        </Button>
        <Button variant="secondary" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Button>
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
  reparticoes = [],
  reparticaoAtiva = null,
  anos = [],
  podeEditar,
  buscaInicial = "",
  situacaoInicial = "",
}: {
  inicial: Pagina;
  resumo: ResumoProtocolos;
  opcoes: OpcoesPorCampo;
  situacoes: SituacaoOpcao[];
  /** Repartições que o grupo acessa (viram as opções de "Órgão"). */
  reparticoes?: RepOpcao[];
  /** Repartição ativa no head (padrão do órgão ao criar); null em "Geral". */
  reparticaoAtiva?: RepOpcao | null;
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
    // Órgão padrão = repartição ativa no head (quando específica).
    const base = draftDe();
    if (reparticaoAtiva) {
      base.orgao = reparticaoAtiva.nome;
      base.orgaoSigla = reparticaoAtiva.codigo;
    }
    setDraft(base);
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
    reparticoes,
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
        <p className="text-sm text-muted">
          {resumo.total} protocolo{resumo.total === 1 ? "" : "s"} · {resumo.emAnalise} em análise
        </p>
        {podeEditar && (
          <Button onClick={iniciarNovo} icon={<IconPlus className="h-[18px] w-[18px]" />} className="hidden lg:inline-flex">
            Novo protocolo
          </Button>
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
          <Button variant="ghost" onClick={() => mudarFiltro({ natureza: "", situacao: "", responsavel: "", ano: "" })}>
            Limpar
          </Button>
        )}
        {carregando && (
          <span className="inline-flex items-center gap-1.5 px-1 text-xs text-faint">
            <IconSpinner className="h-3.5 w-3.5" /> Atualizando…
          </span>
        )}
      </div>

      {vazio ? (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border-2 bg-surface px-6 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-faint">
            <IconInbox className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-bold text-text">Nenhum protocolo encontrado</h3>
          <p className="mt-1 text-sm text-muted">
            {filtrando ? "Ajuste os filtros para ver mais resultados." : "Adicione o primeiro protocolo para começar."}
          </p>
          {podeEditar && (
            <Button onClick={iniciarNovo} icon={<IconPlus className="h-[18px] w-[18px]" />} className="mt-5">
              Novo protocolo
            </Button>
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
          <div className="hidden overflow-x-auto rounded-card border border-border bg-surface lg:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-faint">
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
              <tbody className="divide-y divide-border">
                {editId === "novo" && <LinhaEdicaoDesktop {...edProps} />}
                {pagina.rows.map((p) =>
                  editId === p.id ? (
                    <LinhaEdicaoDesktop key={p.id} {...edProps} />
                  ) : (
                    <tr key={p.id} className="group transition hover:bg-surface-2">
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{p.data ? dataBR(p.data) : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-text">{p.numero}</td>
                      <td className="max-w-[18rem] px-4 py-3">
                        <div className="truncate font-medium text-text-2">{p.orgao ?? "—"}</div>
                        {p.orgaoSigla && <div className="text-xs text-faint">{p.orgaoSigla}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {p.natureza ? <NaturezaTag natureza={p.natureza} /> : <span className="text-faint">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {p.responsavel ? (
                          <div className="flex items-center gap-2">
                            <Avatar nome={p.responsavel} size="sm" />
                            <span className="text-text-2">{p.responsavel}</span>
                          </div>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <SituacaoDot situacao={p.situacao} label={labelSituacao(p.situacao)} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-text-2">{p.distribuicao ?? "—"}</td>
                      {podeEditar && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                            <button type="button" aria-label="Editar" onClick={() => iniciarEdicao(p)} className="rounded-control p-1.5 text-faint transition hover:bg-surface-2 hover:text-accent">
                              <IconPencil className="h-4 w-4" />
                            </button>
                            <button type="button" aria-label="Excluir" onClick={() => excluir(p)} className="rounded-control p-1.5 text-faint transition hover:bg-surface-2 hover:text-[var(--danger)]">
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
      <div className="flex justify-center">
        <Pager page={page} pages={pagina.pages} onChange={irParaPagina} />
      </div>

      {/* FAB (mobile) */}
      {podeEditar && editId === null && <Fab onClick={iniciarNovo} label="Novo" />}
    </div>
  );
}
