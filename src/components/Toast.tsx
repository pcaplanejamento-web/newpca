"use client";

import { useEffect, useState } from "react";
import type { Feedback } from "@/lib/semantic";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";

// Toast — API imperativa (`toast.success("Salvo")`) sobre o AVISO FLUTUANTE padrão (canto inferior,
// pequeno, sem deformar o layout). Monte <Toaster/> uma vez (no RootLayout).
type Variant = "info" | "success" | "warning" | "danger";
type ToastItem = { id: number; msg: string; variant: Variant; duration: number; acao?: { rotulo: string; onClick: () => void }; carregando?: boolean; progresso?: number; etapa?: string };

let listeners: ((t: ToastItem) => void)[] = [];
let seq = 0;

function emit(msg: string, variant: Variant, duration = 4000, acao?: ToastItem["acao"], carregando = false, progresso?: number, etapa?: string) {
  const t: ToastItem = { id: ++seq, msg, variant, duration, acao, carregando, progresso, etapa };
  for (const l of listeners) l(t);
}

export const toast = Object.assign(
  (msg: string, variant: Variant = "info", duration?: number) => emit(msg, variant, duration),
  {
    info: (m: string, d?: number) => emit(m, "info", d),
    success: (m: string, d?: number) => emit(m, "success", d),
    warning: (m: string, d?: number) => emit(m, "warning", d),
    error: (m: string, d?: number) => emit(m, "danger", d),
    /** Sucesso com **Desfazer** (o botão chama `onDesfazer` e fecha o aviso) — mover, redimensionar, excluir… */
    desfazer: (m: string, onDesfazer: () => void, d = 7000) => emit(m, "success", d, { rotulo: "Desfazer", onClick: onDesfazer }),
    /** Informação com UMA ação (ex.: a mensagem nova do chat com "Responder"). */
    acao: (m: string, rotulo: string, onClick: () => void, d = 6000) => emit(m, "info", d, { rotulo, onClick }),
    /** CARREGANDO: o spinner no aviso flutuante até o próximo toast (sucesso/erro) o substituir. */
    carregando: (m: string) => emit(m, "info", 0, undefined, true),
    /** PROGRESSO por ETAPAS reais (ex.: 1 de 3 — enviar, gravar, recalcular): a barra com a % e a etapa em curso. */
    progresso: (m: string, feito: number, total: number, etapa?: string) =>
      emit(m, "info", 0, undefined, true, total > 0 ? Math.max(0, Math.min(100, Math.round((feito / total) * 100))) : 0, etapa),
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
      carregando={item.carregando}
      duracao={item.duration > 0 ? item.duration : undefined}
      onClose={() => setItem((cur) => (cur?.id === item.id ? null : cur))}
      acoes={
        item.acao ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setItem(null);
              item.acao?.onClick();
            }}
          >
            {item.acao.rotulo}
          </Button>
        ) : undefined
      }
    >
      <span className="text-text">{item.msg}</span>
      {item.progresso != null && (
        <span className="mt-2 block min-w-[14rem]">
          <span className="flex items-baseline justify-between gap-3 text-[12px]">
            <span className="truncate text-muted">{item.etapa}</span>
            <span className="font-semibold tabular-nums text-accent">{item.progresso}%</span>
          </span>
          <span
            className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={item.progresso}
            aria-label={item.msg}
          >
            <span className="block h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${item.progresso}%` }} />
          </span>
        </span>
      )}
    </AvisoFlutuante>
  );
}
