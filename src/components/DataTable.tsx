"use client";

import type { ReactNode } from "react";
import { MultiSelectHeader } from "./MultiSelectHeader";

// Tabela do design system (spec §6.6 + pedido do usuário): seleção de linhas
// (checkbox + selecionar todos) e filtro/ordenação no cabeçalho (MultiSelectHeader).
// Por token; rola horizontalmente no mobile (o container não estoura a página).
export type Column<R> = {
  key: string;
  header: string;
  render?: (row: R) => ReactNode;
  align?: "left" | "right";
  sortable?: boolean;
  filterOptions?: string[];
  minWidth?: number;
};

type Key = string | number;

export function DataTable<R>({
  columns,
  rows,
  getKey,
  selectable = false,
  selected,
  onSelected,
  sortKey = null,
  sortDir = null,
  onSort,
  filters = {},
  onFilter,
  minWidth = 720,
  footer,
}: {
  columns: Column<R>[];
  rows: R[];
  getKey: (row: R) => Key;
  selectable?: boolean;
  selected?: Set<Key>;
  onSelected?: (s: Set<Key>) => void;
  sortKey?: string | null;
  sortDir?: "asc" | "desc" | null;
  onSort?: (key: string, dir: "asc" | "desc") => void;
  filters?: Record<string, string[]>;
  onFilter?: (key: string, values: string[]) => void;
  minWidth?: number;
  footer?: ReactNode;
}) {
  const sel = selected ?? new Set<Key>();
  const todos = rows.length > 0 && rows.every((r) => sel.has(getKey(r)));

  function alternarTodos() {
    const n = new Set(sel);
    if (todos) for (const r of rows) n.delete(getKey(r));
    else for (const r of rows) n.add(getKey(r));
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
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`${head} ${c.align === "right" ? "text-right" : "text-left"}`}
                  style={c.minWidth ? { minWidth: c.minWidth } : undefined}
                >
                  {c.filterOptions ? (
                    <MultiSelectHeader
                      label={c.header}
                      options={c.filterOptions}
                      value={filters[c.key] ?? []}
                      onApply={(v) => onFilter?.(c.key, v)}
                      onSort={onSort ? (d) => onSort(c.key, d) : undefined}
                      sortDir={sortKey === c.key ? sortDir : null}
                      align={c.align === "right" ? "end" : "start"}
                    />
                  ) : c.sortable && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(c.key, sortKey === c.key && sortDir === "asc" ? "desc" : "asc")}
                      className="inline-flex items-center gap-1 uppercase tracking-[0.05em] hover:text-text-2"
                    >
                      {c.header}
                      {sortKey === c.key && <span aria-hidden>{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </button>
                  ) : (
                    <span>{c.header}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-12 text-center text-[13px] text-faint">
                  Nenhum registro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-2 px-4 py-2.5 text-[12.5px] text-muted">
          {footer}
        </div>
      )}
    </div>
  );
}
