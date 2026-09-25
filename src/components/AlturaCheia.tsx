"use client";

import { type RefObject, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { ehDesktop, tokenPx } from "./espacamento";

/**
 * ALTURA CHEIA — um bloco da página que OCUPA do topo dele até o fim do display no desktop (o corpo rola por dentro):
 * a tabela com `scrollInterno` do `DataTable` e a `TabelaCruzada`. A MESMA conta em todos (o respiro do `<main>` pelo
 * token `--pad-canvas` + a folga + o que fica fixo abaixo); no celular, fluxo normal.
 */

/** Folga (px) além do respiro do `<main>` na medida da altura — arredondamento de subpixel sem rolar a página. */
export const FOLGA = 4;

/** Distância (px) do fim do bloco à borda inferior do display: o respiro do `<main>` (o token `--pad-canvas` — o
 * MESMO das classes) + a folga + o que fica FIXO abaixo (ex.: a barra de seleção da Mesa). */
export const reservaAteORodape = (reservaInferior: number) => tokenPx("--pad-canvas", 16) + FOLGA + reservaInferior;

/** Topo do elemento NO DOCUMENTO pela cadeia de `offsetTop` — ignora `transform` (o morph das visões anima escala e
 * deslocamento ao montar: o `getBoundingClientRect` no meio da animação mediria alguns px errado e o bloco "pularia" no
 * fim dela). Para blocos da PÁGINA (não dentro de um contêiner fixo). */
export function topoNoDocumento(el: HTMLElement): number {
  let y = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) y += n.offsetTop;
  return y;
}

/**
 * Altura (px) do bloco no desktop — do topo dele até o fim do display, menos a reserva; `null` no celular (fluxo
 * normal). Medida ANTES da pintura e refeita no resize e quando o layout acima muda.
 */
export function useAlturaAteOFim(ref: RefObject<HTMLElement | null>, ativo: boolean, reservaInferior = 0): number | null {
  const [altura, setAltura] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!ativo) return;
    const calc = () => {
      const el = ref.current;
      if (!el) return;
      if (!ehDesktop()) {
        setAltura(null);
        el.style.removeProperty("height"); // a do HTML do servidor, se a tela estreitou antes da hidratação
        return;
      }
      // Posição no DOCUMENTO (não na viewport): rolar a página não encolhe o bloco.
      const top = topoNoDocumento(el);
      if (top <= 0) return;
      setAltura(Math.max(240, Math.floor(window.innerHeight - top - reservaAteORodape(reservaInferior))));
    };
    calc();
    window.addEventListener("resize", calc);
    const ro = new ResizeObserver(calc);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("resize", calc);
      ro.disconnect();
    };
  }, [ref, ativo, reservaInferior]);
  return altura;
}

/**
 * Altura cheia JÁ no HTML do SERVIDOR (F5 / 1º acesso): o navegador roda este trecho ao LER o bloco — antes da 1ª
 * pintura — com a MESMA conta do hook (o topo pela cadeia de `offsetTop` até o fim do display, menos o respiro do
 * `<main>` e a folga; só no desktop). A hidratação assume depois e o trecho sai do DOM. Na navegação pelo app o React não
 * roda scripts — lá o `useLayoutEffect` já mede antes de pintar. Texto FIXO (nenhum dado do usuário).
 */
const ALTURA_NO_HTML = `(function(s){var t=s&&s.parentElement;if(!t||!matchMedia("(min-width: 64rem)").matches)return;var y=0;for(var n=t;n;n=n.offsetParent)y+=n.offsetTop;if(y<=0)return;var p=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--pad-canvas"));t.style.height=Math.max(240,Math.floor(innerHeight-y-(p>=0?p:16)-${FOLGA}))+"px"})(document.currentScript)`;

const semAssinatura = () => () => {};
/** `true` só na renderização do SERVIDOR e na hidratação dela; em seguida (e em toda renderização no cliente), `false`. */
const useHtmlDoServidor = () =>
  useSyncExternalStore(
    semAssinatura,
    () => false,
    () => true,
  );

/** O trecho da altura no HTML do servidor — FILHO DIRETO do bloco (o pai dele recebe a altura). O bloco precisa de
 * `suppressHydrationWarning` (a altura é posta antes da hidratação). */
export function AlturaNoHtml() {
  const htmlDoServidor = useHtmlDoServidor();
  if (!htmlDoServidor) return null;
  // biome-ignore lint/security/noDangerouslySetInnerHtml: trecho FIXO (constante acima, sem dados do usuário) — a altura cheia no HTML do servidor.
  return <script dangerouslySetInnerHTML={{ __html: ALTURA_NO_HTML }} />;
}
