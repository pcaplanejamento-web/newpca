"use client";

import { type ReactNode, useId } from "react";

/**
 * Chave (toggle) do design system — controlada, por token. Trilho `--accent` quando ligada,
 * `--surface-2` quando desligada; o polegar desliza. `role="switch"` + `aria-checked`, foco
 * visível e alvo de toque ≥44px (a área clicável do rótulo). Claro/escuro pelos tokens.
 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  id?: string;
}) {
  const auto = useId();
  const sid = id ?? auto;
  return (
    <label
      htmlFor={sid}
      className={`inline-flex select-none items-center gap-2.5 py-2.5 ${disabled ? "cursor-default opacity-60" : "cursor-pointer"}`}
    >
      <button
        id={sid}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-[var(--motion-duration)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default ${
          checked ? "border-accent bg-accent" : "border-border-2 bg-surface-2"
        }`}
      >
        <span
          className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-[var(--motion-duration)] ${
            checked ? "translate-x-[22px]" : "translate-x-[3px]"
          }`}
        />
      </button>
      {label && <span className="text-[14px] text-text-2">{label}</span>}
    </label>
  );
}
