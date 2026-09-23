"use client";

import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  aplicarFiltros,
  type ColunaDados,
  type FaixaValor,
  type FiltroValor,
  filtroAtivo,
  type IntervaloData,
  normalizarFaixa,
  normalizarSelecao,
  ordenarIndices,
} from "@/lib/tabela-filtros";
import { DateFilterHeader } from "./DateFilterHeader";
import { IconFilter, IconLock } from "./icons";
import { MultiSelectHeader } from "./MultiSelectHeader";
import { Pager } from "./Pager";
import { RangeFilterHeader } from "./RangeFilterHeader";

// Tabela do design system (spec §6.6 + pedidos do usuário): seleção de linhas,
// **filtro em TODOS os cabeçalhos** — multi-select por padrão (inclusive colunas com VÁRIOS valores
// por linha), **datas** (intervalo) e **faixa R$** (barra de arrasto) — CONECTADOS entre si (as opções
// de cada coluna vêm das linhas que passam nos demais filtros), coluna filtrada com o tópico MARCADO,
// ordenação e **paginação** — tudo interno. Por token; rola no mobile sem estourar a página.
export type Column<R> = {
  key: string;
  header: string;
  render?: (row: R) => ReactNode;
  /** Alinhamento horizontal da coluna. Padrão = **center** (dados centralizados); use "right"
   * para valores monetários (R$) e "left" só em exceções. */
  align?: "left" | "center" | "right";
  /** "values" (padrão), "date" (intervalo DE/ATÉ), "range" (faixa numérica — colunas R$, com
   * `numero`) ou "none" (sem filtro). */
  filter?: "values" | "date" | "range" | "none";
  /** Opções fixas (ordem) do multi-select; se omitido, derivadas de `value`/`valores`. */
  filterOptions?: string[];
  /** Valor textual da célula: p/ derivar opções, ordenar e filtrar (datas em ISO). */
  value?: (row: R) => string;
  /** VÁRIOS valores da célula para o FILTRO (ex.: Estado = todos os problemas, inclusive os ocultos
   * no "+N"): a linha passa se QUALQUER um estiver marcado. A ordenação segue `value`. */
  valores?: (row: R) => string[];
  /** Valor NUMÉRICO da célula (filtro "range" e ordenação numérica — ex.: valores R$). */
  numero?: (row: R) => number | null | undefined;
  minWidth?: number;
  /** Sem quebra de linha: a coluna ganha a largura do CONTEÚDO (dados curtos — nº, sigla, badges,
   * valores). A tabela cresce e rola no eixo x do próprio container (nunca estoura a página). */
  nowrap?: boolean;
  /** Filtro TRAVADO por um filtro de hierarquia acima da tabela (ex.: o seletor de assunto da Mesa): o
   * cabeçalho mostra o cadeado com o motivo (tooltip) e o filtro da coluna fica desligado. */
  travado?: string;
};

type Key = string | number;

export function DataTable<R>({
  columns,
  rows,
  getKey,
  selectable = false,
  selected,
  onSelected,
  pageSize,
  footer,
  resumo,
  minWidth = 720,
  onRowClick,
  activeKey = null,
  fillHeight = false,
  scrollInterno = false,
  linhasPadrao,
  density,
  reservaInferior = 0,
}: {
  columns: Column<R>[];
  rows: R[];
  getKey: (row: R) => Key;
  selectable?: boolean;
  selected?: Set<Key>;
  onSelected?: (s: Set<Key>) => void;
  pageSize?: number;
  footer?: ReactNode;
  /** Resumo (ex.: somatórios) calculado sobre as linhas FILTRADAS/ordenadas. */
  resumo?: (linhas: R[]) => ReactNode;
  minWidth?: number;
  /** Clique na LINHA (abre o item). Ignora cliques em controles (input/select/button/a/label). */
  onRowClick?: (row: R) => void;
  /** Linha ATIVA (cuja detalhe está aberta ao lado) — destacada (mestre-detalhe). */
  activeKey?: Key | null;
  /**
   * Ajusta as linhas por página para PREENCHER a altura disponível até o rodapé do
   * display (sem scroll vertical do navegador no desktop). Mede a distância do topo
   * da tabela ao fim da viewport; recalcula no resize. Fallback = `pageSize` ?? 20.
   */
  fillHeight?: boolean;
  /**
   * Scroll INTERNO: a tabela preenche a altura até o rodapé do display e o CORPO rola por
   * dentro (thead fixo, `sticky`), sem scroll vertical do navegador. Um seletor de "linhas
   * por página" (30/50/100/200) fica no rodapé — limita as linhas em DOM (performático mesmo
   * com milhares). Só no desktop; no mobile rola normal (paginado). Opt-in (não afeta as
   * demais tabelas). Exclui o `fillHeight` (têm o mesmo objetivo por caminhos diferentes).
   */
  scrollInterno?: boolean;
  /** Linhas por página INICIAL do seletor de `scrollInterno` (o padrão do ADM); default 30. */
  linhasPadrao?: number;
  /**
   * Densidade da linha (altura via `--cell-py` LOCAL, sem afetar as outras tabelas):
   * `comfortable` = mais alta, `compact` = mais fina, `default`/omitido = respeita o token global.
   * Usado para diferenciar visualmente visões que compartilham o mesmo espaço.
   */
  density?: "compact" | "default" | "comfortable";
  /** Altura (px) RESERVADA no fim do display para algo fixo abaixo da tabela (ex.: a barra de
   * seleção da Mesa) — `scrollInterno`/`fillHeight` descontam, então nada fica por baixo dela. */
  reservaInferior?: number;
}) {
  const [filters, setFilters] = useState<Record<string, FiltroValor>>({});
  const [sort, setSort] = useState<{ key: string | null; dir: "asc" | "desc" }>({ key: null, dir: "asc" });
  const [page, setPage] = useState(1);
  // scrollInterno: linhas por página escolhidas NA PRÓPRIA tabela (limita as linhas em DOM).
  const OPCOES_LINHAS = [30, 50, 100, 200] as const;
  const [limite, setLimite] = useState<number>(linhasPadrao ?? 30);

  // fillHeight: mede as linhas que cabem até o fim da viewport (recalcula no resize).
  const wrapRef = useRef<HTMLDivElement>(null);
  const [autoRows, setAutoRows] = useState<number | null>(null);
  const [maxH, setMaxH] = useState<number | null>(null); // altura do corpo rolável (scrollInterno)
  useEffect(() => {
    if (!fillHeight) return;
    const RESERVA = 32 + reservaInferior; // respiro até a borda inferior (padding do main + folga + barra fixa)
    const calc = () => {
      const el = wrapRef.current;
      if (!el) return;
      // Só no desktop (o mobile rola normalmente e tem bottom-nav fixa).
      if (window.innerWidth < 1024) {
        setAutoRows(null);
        return;
      }
      const top = el.getBoundingClientRect().top;
      if (top <= 0) return; // ainda não posicionada — mantém o fallback
      // Mede as alturas REAIS (linha varia com o conteúdo — ex.: botões de ação).
      const altLinha = el.querySelector("tbody tr")?.getBoundingClientRect().height || 48;
      const altCabecalho = el.querySelector("thead")?.getBoundingClientRect().height || 44;
      const altRodape = 48; // barra do rodapé/pager
      const corpo = window.innerHeight - top - RESERVA - altCabecalho - altRodape;
      const n = Math.floor(corpo / Math.max(altLinha, 30));
      setAutoRows(Math.max(4, Math.min(n, 60)));
    };
    calc();
    window.addEventListener("resize", calc);
    // Recalcula quando o layout acima da tabela muda (callouts, etc.).
    const ro = new ResizeObserver(calc);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("resize", calc);
      ro.disconnect();
    };
  }, [fillHeight, reservaInferior]);

  // scrollInterno: mede a altura disponível até o fim da viewport p/ o corpo rolável (desktop).
  useEffect(() => {
    if (!scrollInterno) return;
    const RESERVA = 32 + reservaInferior;
    const calc = () => {
      const el = wrapRef.current;
      if (!el) return;
      if (window.innerWidth < 1024) {
        setMaxH(null); // mobile: rola normal (paginado)
        return;
      }
      const top = el.getBoundingClientRect().top;
      if (top <= 0) return;
      const altRodape = 48; // barra do rodapé/seletor/pager
      setMaxH(Math.max(200, window.innerHeight - top - RESERVA - altRodape));
    };
    calc();
    window.addEventListener("resize", calc);
    const ro = new ResizeObserver(calc);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("resize", calc);
      ro.disconnect();
    };
  }, [scrollInterno, reservaInferior]);

  // Linhas por página efetivas: scrollInterno (seletor) › fillHeight (medido) › pageSize.
  const tamPagina = scrollInterno ? limite : fillHeight ? (autoRows ?? pageSize ?? 20) : pageSize;

  // Valores de cada coluna extraídos UMA vez por linha (filtro/faceta/ordenação leem daqui).
  const dados = useMemo<ColunaDados[]>(
    () =>
      columns.map((c): ColunaDados => {
        const tipo = c.filter ?? "values";
        if (tipo === "values") {
          const vals = rows.map((r) => (c.valores ? c.valores(r) : c.value ? [c.value(r)] : []));
          return { tipo, vals, ordem: c.filterOptions };
        }
        if (tipo === "date") return { tipo, vals: rows.map((r) => c.value?.(r) ?? "") };
        if (tipo === "range") return { tipo, vals: rows.map((r) => c.numero?.(r) ?? null) };
        return { tipo: "none" };
      }),
    [columns, rows],
  );

  // Filtros CONECTADOS: passa em todos + faceta de cada coluna (opções/faixa/anos) numa passada. Coluna
  // TRAVADA (hierarquia acima da tabela) não filtra.
  const facetas = useMemo(
    () => aplicarFiltros(rows.length, dados, columns.map((c) => (c.travado ? undefined : filters[c.key]))),
    [rows.length, dados, columns, filters],
  );

  // Ordenação pela chave extraída uma vez (numérica p/ `numero`; texto natural senão; vazios no fim).
  const ordenadas = useMemo(() => {
    const col = sort.key ? columns.find((c) => c.key === sort.key) : undefined;
    if (!col || (!col.numero && !col.value)) return facetas.passam.map((i) => rows[i]);
    const chaves = rows.map((r) => (col.numero ? col.numero(r) : col.value?.(r)));
    return ordenarIndices(facetas.passam, chaves, sort.dir).map((i) => rows[i]);
  }, [facetas, sort, columns, rows]);

  const total = ordenadas.length;
  const pages = tamPagina ? Math.max(1, Math.ceil(total / tamPagina)) : 1;
  const pg = Math.min(page, pages);
  const visiveis = tamPagina ? ordenadas.slice((pg - 1) * tamPagina, pg * tamPagina) : ordenadas;

  const sel = selected ?? new Set<Key>();
  // "Selecionar todos" = TODAS as linhas que passam nos filtros (todas as páginas), não só a página.
  const marcadas = selectable ? ordenadas.reduce((n, r) => (sel.has(getKey(r)) ? n + 1 : n), 0) : 0;
  const todos = total > 0 && marcadas === total;
  const parcial = marcadas > 0 && !todos;
  // Colunas com filtro ATIVO (tópico marcado) — e o "Limpar filtros" do rodapé.
  const ativos = columns.filter((c) => !c.travado && filtroAtivo(c.filter ?? "values", filters[c.key]));

  /** Grava (ou remove, com `null`) o filtro de uma coluna e volta à 1ª página. */
  function aplicarFiltro(key: string, v: FiltroValor | null) {
    setFilters((f) => {
      const n = { ...f };
      if (v == null) delete n[key];
      else n[key] = v;
      return n;
    });
    setPage(1);
  }
  function alternarTodos() {
    const n = new Set(sel);
    if (todos) for (const r of ordenadas) n.delete(getKey(r));
    else for (const r of ordenadas) n.add(getKey(r));
    onSelected?.(n);
  }
  function alternar(k: Key) {
    const n = new Set(sel);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    onSelected?.(n);
  }

  const cell = "px-[var(--cell-px)] py-[var(--cell-py)] align-middle";
  const head = "px-[var(--cell-px)] py-3 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-faint";
  const sortDe = (k: string) => (sort.key === k ? sort.dir : null);
  // Densidade LOCAL (só desta tabela): sobrepõe o `--cell-py` no container, sem afetar as demais.
  const densPy = density === "comfortable" ? "18px" : density === "compact" ? "7px" : undefined;

  return (
    <div
      ref={wrapRef}
      className="overflow-hidden rounded-card border border-border bg-surface shadow-ring"
      style={densPy ? ({ "--cell-py": densPy } as CSSProperties) : undefined}
    >
      <div
        className={`overflow-x-auto ${scrollInterno ? "overflow-y-auto" : ""}`}
        style={scrollInterno && maxH != null ? { maxHeight: maxH } : undefined}
      >
        <table className="w-full border-collapse text-sm" style={{ minWidth }}>
          <thead className={`border-b border-border bg-surface-2 ${scrollInterno ? "sticky top-0 z-10" : ""}`}>
            <tr>
              {selectable && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label={todos ? `Desmarcar todos (${total})` : `Selecionar todos (${total})`}
                    title={todos ? `Desmarcar os ${total} registros filtrados` : `Selecionar os ${total} registros filtrados (todas as páginas)`}
                    checked={todos}
                    ref={(el) => {
                      if (el) el.indeterminate = parcial;
                    }}
                    onChange={alternarTodos}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                </th>
              )}
              {columns.map((c, j) => {
                const tipo = c.filter ?? "values";
                const marcado = !c.travado && filtroAtivo(tipo, filters[c.key]);
                // Texto do cabeçalho: right→direita, left→esquerda, padrão→CENTRO (como as células).
                const alinhaTexto = c.align === "right" ? "text-right" : c.align === "left" ? "text-left" : "text-center";
                // Popover do filtro abre alinhado ao início, exceto colunas à direita.
                const alinha = c.align === "right" ? ("end" as const) : ("start" as const);
                const opcoes = facetas.opcoes[j] ?? [];
                return (
                  <th
                    key={c.key}
                    className={`${head} ${alinhaTexto} ${c.nowrap ? "whitespace-nowrap" : ""}`}
                    // Coluna FILTRADA: tópico marcado também por um sublinhado accent no cabeçalho.
                    style={{ ...(c.minWidth ? { minWidth: c.minWidth } : {}), ...(marcado ? { boxShadow: "inset 0 -2px 0 var(--accent)" } : {}) }}
                    aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {c.travado ? (
                      <span className="inline-flex items-center gap-1" title={c.travado}>
                        <IconLock className="h-3 w-3 shrink-0" aria-hidden />
                        {c.header}
                      </span>
                    ) : tipo === "date" ? (
                      <DateFilterHeader
                        label={c.header}
                        value={filters[c.key] as IntervaloData | undefined}
                        anos={facetas.anos[j]?.length ? (facetas.anos[j] as number[]) : undefined}
                        onApply={(v) => aplicarFiltro(c.key, v.de || v.ate ? v : null)}
                        onSort={(d) => setSort({ key: c.key, dir: d })}
                        sortDir={sortDe(c.key)}
                        align={alinha}
                      />
                    ) : tipo === "range" ? (
                      <RangeFilterHeader
                        label={c.header}
                        dominio={facetas.dominios[j] ?? []}
                        value={filters[c.key] as FaixaValor | undefined}
                        onApply={(f) => aplicarFiltro(c.key, normalizarFaixa(f, facetas.dominios[j] ?? []))}
                        onSort={(d) => setSort({ key: c.key, dir: d })}
                        sortDir={sortDe(c.key)}
                        align={alinha}
                        marcado={marcado}
                      />
                    ) : tipo === "values" && (opcoes.length > 0 || marcado) ? (
                      <MultiSelectHeader
                        label={c.header}
                        options={opcoes}
                        value={(filters[c.key] as string[] | undefined) ?? []}
                        onApply={(v) => aplicarFiltro(c.key, normalizarSelecao(v, opcoes))}
                        onSort={(d) => setSort({ key: c.key, dir: d })}
                        sortDir={sortDe(c.key)}
                        align={alinha}
                        marcado={marcado}
                      />
                    ) : (
                      <span>{c.header}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((r) => {
              const k = getKey(r);
              const marcada = sel.has(k);
              const ativa = activeKey != null && k === activeKey;
              return (
                <tr
                  key={k}
                  onClick={
                    onRowClick
                      ? (e) => {
                          if ((e.target as HTMLElement).closest("input,select,button,a,label")) return;
                          onRowClick(r);
                        }
                      : undefined
                  }
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter") onRowClick(r);
                        }
                      : undefined
                  }
                  {...(onRowClick ? { role: "button", tabIndex: 0 } : {})}
                  style={ativa ? { boxShadow: "inset 3px 0 0 var(--accent)" } : undefined}
                  className={`border-b border-border transition-colors last:border-0 hover:bg-surface-2 ${
                    onRowClick ? "cursor-pointer" : ""
                  } ${ativa ? "bg-accent-soft" : marcada ? "bg-accent-soft/60" : ""}`}
                >
                  {selectable && (
                    <td className="w-10 px-3">
                      <input
                        type="checkbox"
                        aria-label="Selecionar linha"
                        checked={marcada}
                        onChange={() => alternar(k)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`${cell} text-[13px] text-text-2 ${c.align === "right" ? "text-right" : c.align === "left" ? "text-left" : "text-center"} ${c.nowrap ? "whitespace-nowrap" : ""}`}
                    >
                      {c.render?.(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {visiveis.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-4 py-12 text-center text-[13px] text-faint"
                >
                  Nenhum registro com os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-2 px-4 py-2.5 text-[12.5px] text-muted">
        <span>
          {resumo ? resumo(ordenadas) : (footer ?? `${total} registro${total === 1 ? "" : "s"}`)}
        </span>
        <div className="flex items-center gap-3">
          {ativos.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilters({});
                setPage(1);
              }}
              title={`Filtros ativos: ${ativos.map((c) => c.header).join(", ")}`}
              className="inline-flex min-h-[32px] items-center gap-1.5 rounded-chip px-2 text-[12px] font-semibold text-accent hover:bg-accent-soft"
            >
              <IconFilter className="h-3.5 w-3.5" /> Limpar filtros ({ativos.length})
            </button>
          )}
          {scrollInterno && (
            <label className="flex items-center gap-1.5 text-[12px] text-muted">
              <span>Linhas</span>
              <select
                aria-label="Linhas por página"
                value={limite}
                onChange={(e) => {
                  setLimite(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-[8px] border border-border bg-surface px-2 py-1 text-[12px] text-text-2 focus:border-accent focus:outline-none"
              >
                {OPCOES_LINHAS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
          {tamPagina && <Pager page={pg} pages={pages} onChange={setPage} />}
        </div>
      </div>
    </div>
  );
}
