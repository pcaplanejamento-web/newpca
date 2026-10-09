"use client";

import type { ComponentType } from "react";

/**
 * Chips de ALTERNAR com ícone — vários ligados ao mesmo tempo (ex.: os avisos que chegam por e-mail). Ligado = na cor do
 * item; desligado = neutro e esmaecido; travado (`fixo`) = sempre ligado, sem clique. `compacto` = só o ícone (o rótulo
 * vira a dica e o nome acessível).
 */
export function ChipsIcone<T extends string>({
  itens,
  ligados,
  onAlternar,
  ariaLabel,
  compacto = false,
}: {
  itens: { value: T; label: string; Icone: ComponentType<{ className?: string }>; cor: string; fixo?: boolean }[];
  ligados: readonly T[];
  onAlternar: (v: T, ligado: boolean) => void;
  ariaLabel: string;
  compacto?: boolean;
}) {
  return (
    <fieldset aria-label={ariaLabel} className="flex min-w-0 flex-wrap gap-1">
      {itens.map(({ value, label, Icone, cor, fixo }) => {
        const ativo = fixo || ligados.includes(value);
        return (
          <button
            key={value}
            type="button"
            aria-pressed={ativo}
            aria-label={fixo ? `${label} (obrigatório)` : label}
            title={fixo ? `${label} — obrigatório` : label}
            disabled={fixo}
            onClick={() => onAlternar(value, !ativo)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-control border text-[12px] font-medium transition-colors duration-[var(--motion-duration)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default lg:min-h-8 ${
              compacto ? "min-w-11 justify-center lg:min-w-8" : "px-2.5"
            } ${ativo ? "border-transparent text-text" : "border-border-2 bg-surface text-faint hover:bg-surface-2 hover:text-muted"}`}
            style={ativo ? { background: `color-mix(in srgb, ${cor} 14%, var(--surface))`, color: cor } : undefined}
          >
            <Icone className="h-3.5 w-3.5 shrink-0" />
            {!compacto && <span className={ativo ? "text-text" : ""}>{label}</span>}
          </button>
        );
      })}
    </fieldset>
  );
}
