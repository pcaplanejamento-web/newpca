"use client";

import { type RefObject, useEffect, useRef } from "react";

/** Para onde LEVAR e em que cor pulsar: a âncora (`data-ancora`) + a cor do status; `nonce` repete o destaque no MESMO lugar. */
export type AncoraAlvo = { ancora: string; cor: string; nonce: number };

/**
 * Rolagem + DESTAQUE de uma âncora dentro de um banner (ao tocar numa pendência): o elemento com `data-ancora`
 * correspondente entra em vista e PULSA na cor do status (some em 2 s). O MESMO efeito no DFD (`DfdConferir`), no item
 * (`ItemDetalhe`) e na capa do protocolo (`ProtocoloView`).
 */
export function useDestaqueAncora(raiz: RefObject<HTMLElement | null>, alvo: AncoraAlvo | null | undefined): void {
  const atual = useRef<{ el: HTMLElement; timer: number } | null>(null);
  useEffect(() => {
    if (!alvo || !raiz.current) return;
    const el = raiz.current.querySelector<HTMLElement>(`[data-ancora="${alvo.ancora}"]`);
    if (!el) return;
    if (atual.current) {
      window.clearTimeout(atual.current.timer);
      atual.current.el.style.boxShadow = "";
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.transition = "box-shadow 0.35s ease";
    el.style.borderRadius = el.style.borderRadius || "14px";
    el.style.boxShadow = `0 0 0 3px ${alvo.cor}, 0 0 0 7px color-mix(in srgb, ${alvo.cor} 22%, transparent)`;
    const timer = window.setTimeout(() => {
      el.style.boxShadow = "";
    }, 2000);
    atual.current = { el, timer };
  }, [alvo, raiz]);
  useEffect(
    () => () => {
      if (atual.current) window.clearTimeout(atual.current.timer);
    },
    [],
  );
}
