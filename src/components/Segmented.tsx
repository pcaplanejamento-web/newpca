"use client";

import type { ReactNode } from "react";

// Controle segmentado (abas) — spec §6.5. Trilho --surface-2, item ativo em
// --surface com sombra leve. Rola horizontalmente se faltar espaço (mobile).
// Altura FIXA do item (32px no desktop; 40px no celular, e a área de toque cobre também o respiro do trilho —
// 46px), então um item SÓ-ÍCONE (`soIcone`: o rótulo vira o nome acessível + a dica; 44px de largura no celular)
// tem a MESMA altura dos de texto.
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = "",
  disabled = false,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; icone?: ReactNode; soIcone?: boolean }[];
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
            aria-label={o.soIcone ? o.label : undefined}
            title={o.soIcone ? o.label : undefined}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`relative inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-chip text-[13px] font-medium transition-colors duration-[var(--motion-duration)] after:absolute after:inset-x-0 after:-inset-y-[3px] after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default disabled:opacity-60 lg:h-8 ${
              o.soIcone ? "w-11 lg:w-8" : "px-3"
            } ${active ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text-2"}`}
          >
            {o.icone}
            {!o.soIcone && o.label}
          </button>
        );
      })}
    </div>
  );
}
