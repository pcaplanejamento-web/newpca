"use client";

import type { ReactNode } from "react";

// Controle segmentado (abas) — spec §6.5. Trilho --surface-2, item ativo em
// --surface com sombra leve. Rola horizontalmente se faltar espaço (mobile).
// ALTURA PADRÃO dos controles: o trilho inteiro mede `--h-control-sm` no desktop (a MESMA do `SeletorFiltro`, do
// `Button size="sm"` e da linha das tabelas compactas — segue a densidade do ADM) e 44px no celular, onde a área de toque
// de cada item cobre também o respiro do trilho (44px). O contorno é um anel INTERNO (não ocupa altura). Um item
// SÓ-ÍCONE (`soIcone`: o rótulo vira o nome acessível + a dica) é quadrado, na mesma altura dos de texto. `curto` = o
// rótulo nos telefones (abaixo de `sm`) quando o inteiro não cabe — o inteiro segue como nome acessível.
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = "",
  disabled = false,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; icone?: ReactNode; soIcone?: boolean; curto?: string }[];
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
      className={`inline-flex max-w-full gap-0.5 overflow-x-auto rounded-segment bg-surface-2 p-[3px] shadow-[inset_0_0_0_1px_var(--border)] ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={o.soIcone || o.curto ? o.label : undefined}
            title={o.soIcone ? o.label : undefined}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`relative inline-flex h-[38px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-chip text-[13px] font-medium transition-colors duration-[var(--motion-duration)] after:absolute after:inset-x-0 after:-inset-y-[3px] after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default disabled:opacity-60 lg:h-[calc(var(--h-control-sm)-6px)] ${
              o.soIcone ? "w-11 lg:w-[calc(var(--h-control-sm)-6px)]" : "px-3"
            } ${active ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text-2"}`}
          >
            {o.icone}
            {!o.soIcone &&
              (o.curto ? (
                <>
                  <span className="sm:hidden">{o.curto}</span>
                  <span className="hidden sm:inline">{o.label}</span>
                </>
              ) : (
                o.label
              ))}
          </button>
        );
      })}
    </div>
  );
}
