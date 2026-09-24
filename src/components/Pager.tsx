"use client";

import { IconChevronLeft, IconChevronRight } from "./icons";

// Paginação do design system: anterior/próxima + "página / total". Fonte única
// (DataTable). Não renderiza nada quando há uma
// página só. Por token.
export function Pager({
  page,
  pages,
  onChange,
  className = "",
}: {
  page: number;
  pages: number;
  onChange: (p: number) => void;
  className?: string;
}) {
  if (pages <= 1) return null;
  // Alvo de toque de 44px no celular; 32px no desktop.
  const btn =
    "inline-flex h-11 w-11 items-center justify-center rounded-control border border-border-2 text-text-2 disabled:opacity-40 enabled:hover:bg-surface lg:h-8 lg:w-8";
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        aria-label="Página anterior"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className={btn}
      >
        <IconChevronLeft className="h-4 w-4" />
      </button>
      <span className="px-2 text-[12.5px] tabular-nums text-muted">
        {page} / {pages}
      </span>
      <button
        type="button"
        aria-label="Próxima página"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        className={btn}
      >
        <IconChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
