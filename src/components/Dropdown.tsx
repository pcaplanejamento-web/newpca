"use client";

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Popover genérico (base de FilterChip/MultiSelect/DateFilter/ColorField/Período).
// O painel é renderizado em PORTAL (position: fixed no body) para NUNCA ser
// recortado por containers com overflow (ex.: cabeçalho de tabela) e é mantido
// dentro da tela. Fecha no clique-fora e no Esc; sombra suave.
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
  const [pos, setPos] = useState({ top: 0, left: 0, w: 224 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const reposicionar = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.min(width ?? Math.max(224, r.width), window.innerWidth - 16);
    let left = align === "end" ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setPos({ top: Math.round(r.bottom + 6), left: Math.round(left), w });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: reposiciona só ao abrir.
  useLayoutEffect(() => {
    if (open) reposicionar();
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: assina só ao abrir; reposicionar lê props/refs estáveis.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onMove = () => reposicionar();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  return (
    <div className="inline-block max-w-full">
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex max-w-full items-center rounded-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${triggerClassName}`}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            className={`fixed z-[200] max-h-[min(80vh,520px)] overflow-auto rounded-card border border-border bg-surface p-2 shadow-soft ${panelClassName}`}
            style={{ top: pos.top, left: pos.left, width: pos.w, maxWidth: "calc(100vw - 16px)" }}
          >
            {typeof children === "function" ? children(() => setOpen(false)) : children}
          </div>,
          document.body,
        )}
    </div>
  );
}
