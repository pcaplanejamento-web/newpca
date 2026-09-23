"use client";

// Controle segmentado (abas) — spec §6.5. Trilho --surface-2, item ativo em
// --surface com sombra leve. Rola horizontalmente se faltar espaço (mobile).
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = "",
  disabled = false,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
  /** Desabilita a interação (ex.: banner de edição travado). */
  disabled?: boolean;
  /** Nome acessível do grupo (ex.: a escolha de QUAL dado — "Escolha: Objeto"). */
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={`inline-flex max-w-full gap-0.5 overflow-x-auto rounded-segment border border-border bg-surface-2 p-[3px] ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`whitespace-nowrap rounded-chip px-3 py-1.5 text-[13px] font-medium transition-colors duration-[var(--motion-duration)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default disabled:opacity-60 ${
              active
                ? "bg-surface text-text shadow-sm"
                : "text-muted hover:text-text-2"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
