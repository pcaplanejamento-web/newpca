"use client";

import { TIPO_DFD_ROTULO, TIPOS_DFD } from "@/lib/avaliacao-core";

/**
 * Seletor de um CONJUNTO de tipos de DFD (DFD-S/R/O/E) — chips de alternância.
 * Controlado (`value`/`onChange`). Reutilizado no envio do catálogo (tipos padrão), na
 * edição em massa e no detalhe do item. Só tokens do design-system.
 */
export function TipoDfdPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (tipos: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (t: string) => {
    if (disabled) return;
    onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {TIPOS_DFD.map((t) => {
        const active = value.includes(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}
            disabled={disabled}
            aria-pressed={active}
            title={TIPO_DFD_ROTULO[t]}
            className={`inline-flex h-[var(--h-control-sm)] items-center rounded-chip border px-3 text-[13px] font-semibold transition-colors duration-[var(--motion-duration)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60 ${
              active
                ? "border-accent/40 bg-accent-soft text-accent"
                : "border-border-2 bg-surface text-text-2 hover:bg-surface-2"
            }`}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
