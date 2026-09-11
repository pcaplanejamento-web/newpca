"use client";

import { useEffect, useState } from "react";
import { IconClose } from "./icons";

// Banner flutuante (toast) — componente do design system. API imperativa:
// `toast.success("Salvo")`. Monte <Toaster/> uma vez (no RootLayout). Por token,
// com sombra suave; respeita --motion via .animate-fade-in-up.
type Variant = "info" | "success" | "warning" | "danger";
type ToastItem = { id: number; msg: string; variant: Variant; duration: number };

let listeners: ((t: ToastItem) => void)[] = [];
let seq = 0;

function emit(msg: string, variant: Variant, duration = 4000) {
  const t: ToastItem = { id: ++seq, msg, variant, duration };
  for (const l of listeners) l(t);
}

export const toast = Object.assign(
  (msg: string, variant: Variant = "info", duration?: number) => emit(msg, variant, duration),
  {
    info: (m: string, d?: number) => emit(m, "info", d),
    success: (m: string, d?: number) => emit(m, "success", d),
    warning: (m: string, d?: number) => emit(m, "warning", d),
    error: (m: string, d?: number) => emit(m, "danger", d),
  },
);

const COR: Record<Variant, string> = {
  info: "var(--accent)",
  success: "var(--sit-finalizado)",
  warning: "var(--sit-em-analise)",
  danger: "var(--sit-cancelado)",
};

export function Toaster() {
  // Um único banner por vez: um toast novo SUBSTITUI o anterior (nunca empilha).
  const [item, setItem] = useState<ToastItem | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const l = (t: ToastItem) => {
      setItem(t);
      if (timer) clearTimeout(timer);
      if (t.duration > 0) {
        timer = setTimeout(() => setItem((cur) => (cur?.id === t.id ? null : cur)), t.duration);
      }
    };
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!item) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center p-4 sm:justify-end"
    >
      <div
        key={item.id}
        role="status"
        className="animate-fade-in-up pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-card border border-border bg-surface p-3 shadow-soft"
      >
        <span
          aria-hidden
          className="mt-1 h-2 w-2 shrink-0 rounded-full"
          style={{
            background: COR[item.variant],
            boxShadow: `0 0 0 3px color-mix(in srgb, ${COR[item.variant]} 16%, var(--glow-target))`,
          }}
        />
        <p className="min-w-0 flex-1 text-[13px] text-text">{item.msg}</p>
        <button
          type="button"
          aria-label="Fechar"
          onClick={() => setItem(null)}
          className="shrink-0 rounded-md p-0.5 text-faint transition-colors hover:bg-surface-2 hover:text-text-2"
        >
          <IconClose className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
