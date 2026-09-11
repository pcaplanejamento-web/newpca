"use client";

import type { ReactNode } from "react";
import { IconPlus } from "./icons";

/** Botão de ação flutuante — só no mobile (no desktop a ação fica no cabeçalho).
 *  Posicionado acima da barra de navegação inferior. */
export function Fab({
  onClick,
  label = "Novo",
  icon,
}: {
  onClick: () => void;
  label?: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="fixed bottom-[4.75rem] right-4 z-30 inline-flex items-center gap-2 rounded-full bg-text px-5 py-3.5 text-sm font-semibold text-surface shadow-soft transition active:scale-95 hover:opacity-90 lg:hidden"
    >
      {icon ?? <IconPlus className="h-5 w-5" />}
      {label}
    </button>
  );
}
