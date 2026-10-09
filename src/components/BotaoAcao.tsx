"use client";

import type { ReactNode } from "react";
import { Button } from "./Button";

/**
 * Botão de AÇÃO dos rodapés/cabeçalhos dos banners — SÓ O ÍCONE (quadrado: 44px no toque, `--h-control-sm` no desktop),
 * com o nome na dica e no nome acessível (`rotulo`). `contagem` = o chip no canto (ex.: Duplicados 2, Tarefas 1/3).
 * `texto` = a AÇÃO PRINCIPAL do banner: ícone + texto a partir de 640px, só o ícone no celular (a linha única cabe).
 */
export function BotaoAcao({
  rotulo,
  icon,
  onClick,
  variant = "secondary",
  disabled = false,
  loading = false,
  dica,
  contagem,
  texto = false,
  pressionado,
}: {
  rotulo: string;
  icon: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  /** A dica quando difere do rótulo (ex.: o motivo de estar desabilitado). */
  dica?: string;
  contagem?: string | number | null;
  texto?: boolean;
  /** Alterna um painel: marca o botão enquanto ele está aberto. */
  pressionado?: boolean;
}) {
  const temContagem = contagem != null && contagem !== "" && contagem !== 0;
  return (
    <span className="relative inline-flex shrink-0">
      <Button
        variant={variant}
        size="sm"
        icon={icon}
        onClick={onClick}
        disabled={disabled}
        loading={loading}
        aria-label={temContagem ? `${rotulo} (${contagem})` : rotulo}
        title={dica ?? (temContagem ? `${rotulo} (${contagem})` : rotulo)}
        aria-pressed={pressionado}
        className={`${pressionado ? "ring-2 ring-accent/40" : ""} ${texto ? "max-sm:w-11 max-sm:px-0" : ""}`}
      >
        {texto ? <span className="hidden sm:inline">{rotulo}</span> : undefined}
      </Button>
      {temContagem && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-1.5 -right-1.5 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10.5px] font-bold leading-[18px] text-white tabular-nums shadow-soft"
        >
          {contagem}
        </span>
      )}
    </span>
  );
}
