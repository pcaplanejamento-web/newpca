"use client";

import { useEffect, useState } from "react";
import type { Feedback } from "@/lib/semantic";
import { AvisoFlutuante } from "./AvisoFlutuante";

// Toast — API imperativa (`toast.success("Salvo")`) sobre o AVISO FLUTUANTE padrão (canto inferior,
// pequeno, sem deformar o layout). Monte <Toaster/> uma vez (no RootLayout).
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

/** Variante do toast → feedback do `AvisoFlutuante` (o MESMO componente dos avisos flutuantes). */
const KIND: Record<Variant, Feedback> = { info: "info", success: "ok", warning: "warn", danger: "danger" };

export function Toaster() {
  // Um único toast por vez: um toast novo SUBSTITUI o anterior (nunca empilha).
  const [item, setItem] = useState<ToastItem | null>(null);

  useEffect(() => {
    const l = (t: ToastItem) => setItem(t);
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);

  if (!item) return null;
  return (
    <AvisoFlutuante
      key={item.id}
      kind={KIND[item.variant]}
      duracao={item.duration > 0 ? item.duration : undefined}
      onClose={() => setItem((cur) => (cur?.id === item.id ? null : cur))}
    >
      <span className="text-text">{item.msg}</span>
    </AvisoFlutuante>
  );
}
