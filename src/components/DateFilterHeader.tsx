"use client";

import { useState } from "react";
import { Dropdown } from "./Dropdown";
import { IconChevronDown } from "./icons";

// Filtro de DATA no cabeçalho da tabela: ordenar + intervalo DE/ATÉ. Emite
// `{ de, ate }` (ISO). Componente do design system, por token.
export type IntervaloData = { de?: string; ate?: string };

export function DateFilterHeader({
  label,
  value,
  onApply,
  onSort,
  sortDir = null,
  align = "start",
}: {
  label: string;
  value?: IntervaloData;
  onApply: (v: IntervaloData) => void;
  onSort?: (dir: "asc" | "desc") => void;
  sortDir?: "asc" | "desc" | null;
  align?: "start" | "end";
}) {
  const ativo = !!(value?.de || value?.ate);
  return (
    <Dropdown
      align={align}
      ariaLabel={`Filtrar ${label}`}
      triggerClassName="w-full gap-1.5 px-1 py-2"
      panelClassName="p-0"
      width={264}
      trigger={
        <span className="flex w-full items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-faint">
          <span className="truncate">{label}</span>
          {sortDir === "asc" && <span aria-hidden>▲</span>}
          {sortDir === "desc" && <span aria-hidden>▼</span>}
          <IconChevronDown
            className={`ml-auto h-3.5 w-3.5 shrink-0 ${ativo ? "text-accent" : "opacity-60"}`}
          />
        </span>
      }
    >
      {(close) => (
        <Painel
          value={value}
          onApply={(v) => {
            onApply(v);
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
  value,
  onApply,
  onCancel,
  onSort,
}: {
  value?: IntervaloData;
  onApply: (v: IntervaloData) => void;
  onCancel: () => void;
  onSort?: (dir: "asc" | "desc") => void;
}) {
  const [de, setDe] = useState(value?.de ?? "");
  const [ate, setAte] = useState(value?.ate ?? "");
  const inp =
    "h-[var(--h-control-sm)] w-full rounded-control border border-border-2 bg-surface px-2 text-[13px] text-text outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
  const btn = "flex-1 rounded-control border border-border-2 px-2 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-surface-2";

  return (
    <div className="w-full p-2">
      {onSort && (
        <div className="mb-2 flex gap-2">
          <button type="button" onClick={() => onSort("asc")} className={btn}>
            ↑ Crescente
          </button>
          <button type="button" onClick={() => onSort("desc")} className={btn}>
            ↓ Decrescente
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          De
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={`mt-0.5 ${inp}`} />
        </label>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Até
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={`mt-0.5 ${inp}`} />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onApply({ de: de || undefined, ate: ate || undefined })}
          className="flex-1 rounded-control bg-accent px-2 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
        >
          Aplicar
        </button>
        <button
          type="button"
          onClick={() => {
            setDe("");
            setAte("");
            onApply({});
          }}
          className={btn}
        >
          Limpar
        </button>
        <button type="button" onClick={onCancel} className={btn}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
