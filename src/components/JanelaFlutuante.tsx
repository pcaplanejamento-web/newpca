"use client";

import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { ehDesktop } from "./espacamento";
import { IconClose, IconGrip } from "./icons";
import { Modal } from "./Modal";
import { segurar } from "./segurar";

/**
 * JANELA FLUTUANTE ancorada (a criação rápida do Calendário, como no Google Agenda): no DESKTOP, um cartão ao lado do
 * ponto clicado (`ancora` — à direita se couber, senão à esquerda; sempre dentro da tela), ARRASTÁVEL pela alça do topo
 * para não cobrir o dia; fecha no X, no Esc e no toque fora. No CELULAR/tablet vira o `Modal` (folha de baixo). O
 * conteúdo e o rodapé vêm de quem usa.
 */
export function JanelaFlutuante({
  aberta,
  ancora,
  titulo,
  onFechar,
  children,
  rodape,
  largura = 440,
}: {
  aberta: boolean;
  /** O retângulo (viewport) do ponto clicado. */
  ancora: { x: number; y: number; w: number; h: number } | null;
  /** Nome acessível (e título no celular). */
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: number;
}) {
  const [desk, setDesk] = useState(true);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const fechar = useRef(onFechar);
  fechar.current = onFechar;

  useEffect(() => {
    if (aberta) setDesk(ehDesktop());
  }, [aberta]);

  // Posição inicial: ao lado da âncora, dentro da tela (mede a altura real antes de pintar).
  useLayoutEffect(() => {
    if (!aberta || !desk) return setPos(null);
    const el = ref.current;
    const h = el?.offsetHeight ?? 360;
    const w = Math.min(largura, window.innerWidth - 16);
    const a = ancora ?? { x: window.innerWidth / 2 - w / 2, y: window.innerHeight / 3, w: 0, h: 0 };
    const direita = a.x + a.w + 12;
    const x = direita + w <= window.innerWidth - 8 ? direita : Math.max(8, a.x - w - 12);
    const y = Math.max(8, Math.min(a.y - 40, window.innerHeight - h - 8));
    setPos({ x, y });
  }, [aberta, desk, ancora, largura]);

  // Esc e o toque FORA fecham (um Modal aberto por cima — "Mais opções" — tem precedência).
  useEffect(() => {
    if (!aberta || !desk) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[role='dialog'][aria-modal='true']")) fechar.current();
    };
    const fora = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest("[role='dialog'], [role='menu']")) return;
      fechar.current();
    };
    window.addEventListener("keydown", tecla);
    // No próximo quadro: o próprio clique que abriu a janela não a fecha.
    const t = window.setTimeout(() => document.addEventListener("pointerdown", fora), 0);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.clearTimeout(t);
      document.removeEventListener("pointerdown", fora);
    };
  }, [aberta, desk]);

  const arrastar = (ev0: ReactPointerEvent<HTMLElement>) => {
    if (!pos || ev0.button > 0) return;
    ev0.preventDefault();
    const x0 = ev0.clientX - pos.x;
    const y0 = ev0.clientY - pos.y;
    const soltar = segurar("grabbing");
    const mover = (e: PointerEvent) => {
      const w = ref.current?.offsetWidth ?? largura;
      const h = ref.current?.offsetHeight ?? 300;
      setPos({ x: Math.max(8, Math.min(e.clientX - x0, window.innerWidth - w - 8)), y: Math.max(8, Math.min(e.clientY - y0, window.innerHeight - h - 8)) });
    };
    const fim = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", fim);
      window.removeEventListener("pointercancel", fim);
      soltar();
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", fim);
    window.addEventListener("pointercancel", fim);
  };

  if (!aberta) return null;
  if (!desk)
    return (
      <Modal open onClose={onFechar} titulo={titulo} size="md" rodape={rodape}>
        {children}
      </Modal>
    );
  return createPortal(
    <section
      ref={ref}
      aria-label={titulo}
      className="fixed z-[150] flex max-h-[calc(100dvh-16px)] flex-col rounded-card border border-border bg-surface shadow-soft animate-fade-in-up"
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? 0, width: Math.min(largura, typeof window === "undefined" ? largura : window.innerWidth - 16) }}
    >
      <div className="flex items-center justify-between gap-2 pl-1.5 pr-1.5 pt-1.5">
        <button
          type="button"
          onPointerDown={arrastar}
          aria-label="Arrastar a janela"
          title="Arrastar"
          className="grid h-8 w-10 cursor-grab touch-none place-items-center rounded-control text-faint hover:bg-surface-2 active:cursor-grabbing"
        >
          <IconGrip className="h-4 w-4 rotate-90" />
        </button>
        <Button variant="ghost" size="sm" aria-label="Fechar" icon={<IconClose className="h-4 w-4" />} onClick={onFechar} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--pad-card)] pb-2">{children}</div>
      {rodape && <div className="border-t border-border px-[var(--pad-card)] py-2.5">{rodape}</div>}
    </section>,
    document.body,
  );
}
