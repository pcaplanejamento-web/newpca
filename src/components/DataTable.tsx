"use client";

import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { DateFilterHeader, type IntervaloData } from "./DateFilterHeader";
import { MultiSelectHeader } from "./MultiSelectHeader";
import { Pager } from "./Pager";

// Tabela do design system (spec §6.6 + pedidos do usuário): seleção de linhas,
// **filtro em TODOS os cabeçalhos** (multi-select por padrão; **filtro de datas**
// nas colunas de data), ordenação e **paginação** — tudo interno. Por token; rola
// no mobile sem estourar a página.
export type Column<R> = {
  key: string;
  header: string;
  render?: (row: R) => ReactNode;
  /** Alinhamento horizontal da coluna. Padrão = **center** (dados centralizados); use "right"
   * para valores monetários (R$) e "left" só em exceções. */
  align?: "left" | "center" | "right";
  /** "values" (padrão), "date" (intervalo DE/ATÉ) ou "none" (sem filtro). */
  filter?: "values" | "date" | "none";
  /** Opções fixas do multi-select; se omitido, derivadas de `value`. */
  filterOptions?: string[];
  /** Valor textual da célula: p/ derivar opções, ordenar e filtrar (datas em ISO). */
  value?: (row: R) => string;
  minWidth?: number;
};

type Key = string | number;
type FiltroValor = string[] | IntervaloData;

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
    const RESERVA = 32; // respiro até a borda inferior (padding do main + folga)
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
  }, [fillHeight]);

  // scrollInterno: mede a altura disponível até o fim da viewport p/ o corpo rolável (desktop).
  useEffect(() => {
    if (!scrollInterno) return;
    const RESERVA = 32;
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
  }, [scrollInterno]);

  // Linhas por página efetivas: scrollInterno (seletor) › fillHeight (medido) › pageSize.
  const tamPagina = scrollInterno ? limite : fillHeight ? (autoRows ?? pageSize ?? 20) : pageSize;

  const opcoes = useMemo(() => {
    const o: Record<string, string[]> = {};
    for (const c of columns) {
      if ((c.filter ?? "values") === "values") {
        o[c.key] = c.filterOptions ??
          (c.value ? [...new Set(rows.map((r) => c.value?.(r) ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")) : []);
      }
    }
    return o;
  }, [columns, rows]);

  // Anos presentes em cada coluna de data — alimentam a grade "Ano" do período.
  const anosData = useMemo(() => {
    const m: Record<string, number[]> = {};
    for (const c of columns) {
      if ((c.filter ?? "values") === "date" && c.value) {
        const ys = [
          ...new Set(
            rows
              .map((r) => c.value?.(r)?.slice(0, 4))
              .filter((s): s is string => !!s && /^\d{4}$/.test(s)),
          ),
        ]
          .map(Number)
          .sort((a, b) => b - a);
        m[c.key] = ys.length ? ys : [new Date().getFullYear()];
      }
    }
    return m;
  }, [columns, rows]);

  const filtradas = useMemo(() => {
    return rows.filter((r) => {
      for (const c of columns) {
        const f = filters[c.key];
        if (!f || !c.value) continue;
        if ((c.filter ?? "values") === "date" && !Array.isArray(f)) {
          const v = c.value(r);
          if (f.de && v < f.de) return false;
          if (f.ate && v > f.ate) return false;
        } else if (Array.isArray(f) && f.length > 0) {
          const opts = opcoes[c.key] ?? [];
          if (f.length < opts.length && !f.includes(c.value(r))) return false;
        }
      }
      return true;
    });
  }, [rows, columns, filters, opcoes]);

  const ordenadas = useMemo(() => {
    if (!sort.key) return filtradas;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.value) return filtradas;
    const getV = col.value;
    const arr = [...filtradas].sort((a, b) => {
      const va = getV(a);
      const vb = getV(b);
      const na = Number(va);
      const nb = Number(vb);
      const cmp =
        va !== "" && vb !== "" && !Number.isNaN(na) && !Number.isNaN(nb)
          ? na - nb
          : va.localeCompare(vb, "pt-BR");
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtradas, sort, columns]);

  const total = ordenadas.length;
  const pages = tamPagina ? Math.max(1, Math.ceil(total / tamPagina)) : 1;
  const pg = Math.min(page, pages);
  const visiveis = tamPagina ? ordenadas.slice((pg - 1) * tamPagina, pg * tamPagina) : ordenadas;

  const sel = selected ?? new Set<Key>();
  const todos = visiveis.length > 0 && visiveis.every((r) => sel.has(getKey(r)));

  function aplicarFiltro(key: string, v: FiltroValor) {
    setFilters((f) => ({ ...f, [key]: v }));
    setPage(1);
  }
  function alternarTodos() {
    const n = new Set(sel);
    if (todos) for (const r of visiveis) n.delete(getKey(r));
    else for (const r of visiveis) n.add(getKey(r));
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
                    aria-label="Selecionar todos"
                    checked={todos}
                    onChange={alternarTodos}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                </th>
              )}
              {columns.map((c) => {
                const tipo = c.filter ?? "values";
                // Texto do cabeçalho: right→direita, left→esquerda, padrão→CENTRO (como as células).
                const alinhaTexto = c.align === "right" ? "text-right" : c.align === "left" ? "text-left" : "text-center";
                // Popover do filtro (MultiSelectHeader) abre alinhado ao início, exceto colunas à direita.
                const alinha = c.align === "right" ? ("end" as const) : ("start" as const);
                return (
                  <th
                    key={c.key}
                    className={`${head} ${alinhaTexto}`}
                    style={c.minWidth ? { minWidth: c.minWidth } : undefined}
                  >
                    {tipo === "date" ? (
                      <DateFilterHeader
                        label={c.header}
                        value={filters[c.key] as IntervaloData}
                        anos={anosData[c.key]}
                        onApply={(v) => aplicarFiltro(c.key, v)}
                        onSort={(d) => setSort({ key: c.key, dir: d })}
                        sortDir={sortDe(c.key)}
                        align={alinha}
                      />
                    ) : tipo === "values" && (opcoes[c.key]?.length ?? 0) > 0 ? (
                      <MultiSelectHeader
                        label={c.header}
                        options={opcoes[c.key]}
                        value={(filters[c.key] as string[]) ?? []}
                        onApply={(v) => aplicarFiltro(c.key, v)}
                        onSort={(d) => setSort({ key: c.key, dir: d })}
                        sortDir={sortDe(c.key)}
                        align={alinha}
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
                      className={`${cell} text-[13px] text-text-2 ${c.align === "right" ? "text-right" : c.align === "left" ? "text-left" : "text-center"}`}
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
