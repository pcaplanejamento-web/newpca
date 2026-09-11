"use client";

import { useMemo, useState } from "react";
import { Dropdown } from "./Dropdown";
import { IconChevronDown } from "./icons";

// Filtro de cabeçalho de tabela (spec do usuário): ordenar (crescente/decrescente)
// + busca + "Selecionar todos" + checkboxes + Aplicar/Cancelar/Remover.
type Dir = "asc" | "desc" | null;

export function MultiSelectHeader({
  label,
  options,
  value,
  onApply,
  onSort,
  sortDir = null,
  align = "start",
}: {
  label: string;
  options: string[];
  value: string[];
  onApply: (sel: string[]) => void;
  onSort?: (dir: "asc" | "desc") => void;
  sortDir?: Dir;
  align?: "start" | "end";
}) {
  const filtrado = value.length > 0 && value.length < options.length;

  return (
    <Dropdown
      align={align}
      ariaLabel={`Filtrar ${label}`}
      triggerClassName="w-full gap-1.5 px-1 py-2"
      panelClassName="p-0"
      width={280}
      trigger={
        <span className="flex w-full items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-faint">
          <span className="truncate">{label}</span>
          {sortDir === "asc" && <span aria-hidden>▲</span>}
          {sortDir === "desc" && <span aria-hidden>▼</span>}
          <IconChevronDown
            className={`ml-auto h-3.5 w-3.5 shrink-0 ${filtrado ? "text-accent" : "opacity-60"}`}
          />
        </span>
      }
    >
      {(close) => (
        <Painel
          label={label}
          options={options}
          value={value}
          onApply={(s) => {
            onApply(s);
            close();
          }}
          onCancel={close}
          onSort={onSort ? (d) => { onSort(d); close(); } : undefined}
        />
      )}
    </Dropdown>
  );
}

function Painel({
  options,
  value,
  onApply,
  onCancel,
  onSort,
}: {
  label: string;
  options: string[];
  value: string[];
  onApply: (sel: string[]) => void;
  onCancel: () => void;
  onSort?: (dir: "asc" | "desc") => void;
}) {
  const inicial = value.length ? value : options;
  const [sel, setSel] = useState<Set<string>>(new Set(inicial));
  const [q, setQ] = useState("");

  const visiveis = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => o.toLowerCase().includes(t)) : options;
  }, [q, options]);

  const todosMarcados = visiveis.length > 0 && visiveis.every((o) => sel.has(o));

  function alternar(o: string) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(o)) n.delete(o);
      else n.add(o);
      return n;
    });
  }
  function alternarTodos() {
    setSel((prev) => {
      const n = new Set(prev);
      if (todosMarcados) for (const o of visiveis) n.delete(o);
      else for (const o of visiveis) n.add(o);
      return n;
    });
  }

  const btn = "flex-1 rounded-control border border-border-2 px-2 py-1.5 text-[12px] font-semibold";

  return (
    <div className="flex max-h-[min(70vh,420px)] w-full flex-col">
      {onSort && (
        <div className="flex gap-2 p-2">
          <button type="button" onClick={() => onSort("asc")} className={`${btn} text-text-2 hover:bg-surface-2`}>
            ↑ Crescente
          </button>
          <button type="button" onClick={() => onSort("desc")} className={`${btn} text-text-2 hover:bg-surface-2`}>
            ↓ Decrescente
          </button>
        </div>
      )}
      <div className="px-2 pb-1 pt-1">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtro"
          className="h-[var(--h-control-sm)] w-full rounded-control border border-border-2 bg-surface px-2.5 text-[13px] text-text outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 text-[13px] font-semibold text-text">
        <input
          type="checkbox"
          checked={todosMarcados}
          onChange={alternarTodos}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        Selecionar todos
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {visiveis.map((o) => (
          <label
            key={o}
            className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px] text-text-2 hover:bg-surface-2"
          >
            <input
              type="checkbox"
              checked={sel.has(o)}
              onChange={() => alternar(o)}
              className="h-4 w-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="truncate" title={o}>{o}</span>
          </label>
        ))}
        {visiveis.length === 0 && (
          <div className="px-3 py-4 text-center text-[12px] text-faint">Nada encontrado</div>
        )}
      </div>
      <div className="flex gap-2 border-t border-border p-2">
        <button
          type="button"
          onClick={() => onApply([...sel])}
          className="flex-1 rounded-control bg-accent px-2 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
        >
          Aplicar
        </button>
        <button type="button" onClick={onCancel} className={`${btn} text-text-2 hover:bg-surface-2`}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onApply(options)}
          className="rounded-control px-2 py-1.5 text-[12px] font-semibold text-[color:var(--sit-cancelado)] hover:bg-surface-2"
        >
          Remover
        </button>
      </div>
    </div>
  );
}
