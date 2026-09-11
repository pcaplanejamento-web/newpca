"use client";

import { IconChevronDown } from "./icons";

// Chip de filtro (spec §6.5): altura --h-control-sm, superfície + borda, chevron.
// Estado ativo usa o accent suave. Por token; foco visível.
export function FilterChip({
  label,
  active = false,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-[var(--h-control-sm)] shrink-0 items-center gap-1.5 rounded-chip border px-3 text-[13px] font-medium transition-colors duration-[var(--motion-duration)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
        active
          ? "border-accent/40 bg-accent-soft text-accent"
          : "border-border-2 bg-surface text-text-2 hover:bg-surface-2"
      }`}
    >
      {label}
      <IconChevronDown className="h-3.5 w-3.5 opacity-60" />
    </button>
  );
}
