"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

// Popover genérico (base de FilterChip/MultiSelect/ColorField/Período). O
// `trigger` carrega o próprio visual (é envolvido num botão acessível). Fecha
// no clique-fora e no Esc; painel com sombra suave (--shadow-soft).
export function Dropdown({
  trigger,
  children,
  align = "start",
  triggerClassName = "",
  panelClassName = "",
  width,
  ariaLabel,
}: {
  trigger: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  triggerClassName?: string;
  panelClassName?: string;
  width?: number;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block max-w-full">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex max-w-full items-center rounded-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${triggerClassName}`}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute z-40 mt-1.5 rounded-card border border-border bg-surface p-2 shadow-soft ${
            align === "end" ? "right-0" : "left-0"
          } ${panelClassName}`}
          style={width ? { width } : { minWidth: 224 }}
        >
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}
