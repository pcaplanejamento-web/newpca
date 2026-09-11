"use client";

import { type ReactNode, useMemo, useState } from "react";
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
  align?: "left" | "right";
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
  minWidth = 720,
}: {
  columns: Column<R>[];
  rows: R[];
  getKey: (row: R) => Key;
  selectable?: boolean;
  selected?: Set<Key>;
  onSelected?: (s: Set<Key>) => void;
  pageSize?: number;
  footer?: ReactNode;
  minWidth?: number;
}) {
  const [filters, setFilters] = useState<Record<string, FiltroValor>>({});
  const [sort, setSort] = useState<{ key: string | null; dir: "asc" | "desc" }>({ key: null, dir: "asc" });
  const [page, setPage] = useState(1);

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
  const pages = pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const pg = Math.min(page, pages);
  const visiveis = pageSize ? ordenadas.slice((pg - 1) * pageSize, pg * pageSize) : ordenadas;

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

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-ring">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth }}>
          <thead className="border-b border-border bg-surface-2">
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
                const alinha = c.align === "right" ? ("end" as const) : ("start" as const);
                return (
                  <th
                    key={c.key}
                    className={`${head} ${c.align === "right" ? "text-right" : "text-left"}`}
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
              return (
                <tr
                  key={k}
                  className={`border-b border-border transition-colors last:border-0 hover:bg-surface-2 ${
                    marcada ? "bg-accent-soft/60" : ""
                  }`}
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
                      className={`${cell} text-[13px] text-text-2 ${c.align === "right" ? "text-right" : ""}`}
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
        <span>{footer ?? `${total} registro${total === 1 ? "" : "s"}`}</span>
        {pageSize && <Pager page={pg} pages={pages} onChange={setPage} />}
      </div>
    </div>
  );
}
