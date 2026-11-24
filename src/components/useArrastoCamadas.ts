"use client";

import { type RefObject, useEffect, useRef } from "react";
import { camadaAoSoltar, deslocamentoCarrossel, gestoComecou } from "@/lib/gesto-fechar";

/**
 * DESLIZAR ENTRE CAMADAS no toque (o carrossel do `Modal` no celular — Protocolo · DFD · Item): o trilho segue o dedo na
 * horizontal (resistência antes da primeira e depois da última) e, ao soltar, vai à vizinha (25% ou peteleco) ou volta.
 * Eventos de TOUCH com o `touchmove` não passivo (segura a rolagem só depois que o gesto horizontal começou — a rolagem
 * vertical do conteúdo segue normal). Não começa dentro de algo que rola de lado (tabelas largas), de campos nem da alça
 * de fechar. `onMover(px | null)` = o deslocamento ao vivo (null = soltou); `onTrocar(indice)` = a camada escolhida.
 */
export function useArrastoCamadas(
  ref: RefObject<HTMLElement | null>,
  { indice, total, onMover, onTrocar, ativo = true }: { indice: number; total: number; onMover: (px: number | null) => void; onTrocar: (i: number) => void; ativo?: boolean },
) {
  // Os valores mais recentes sem reinscrever os ouvintes (uma renderização no meio do arrasto não solta o dedo).
  const atual = useRef({ indice, total, onMover, onTrocar });
  atual.current = { indice, total, onMover, onTrocar };
  useEffect(() => {
    const el = ref.current;
    if (!el || !ativo) return;
    let id: number | null = null;
    let x0 = 0;
    let y0 = 0;
    let arrastando = false;
    let ultimo = { d: 0, t: 0 };
    let velocidade = 0;

    const rolaDeLado = (alvo: Element | null): boolean => {
      for (let n = alvo; n && n !== el; n = n.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(n).overflowX) && n.scrollWidth > n.clientWidth + 1) return true;
      }
      return false;
    };
    const down = (e: TouchEvent) => {
      if (id != null || e.touches.length !== 1 || atual.current.total < 2) return;
      const alvo = e.target as Element | null;
      if (alvo?.closest("input, textarea, select, [contenteditable], [role='slider']") || rolaDeLado(alvo)) return;
      // A alça/cabeçalho é do gesto de FECHAR só onde ele vale (a folha do celular); no tablet, deslizar ali troca a camada.
      if (alvo?.closest("[data-alca-fechar]") && matchMedia("(max-width: 39.999rem)").matches) return;
      const t = e.changedTouches[0];
      id = t.identifier;
      x0 = t.clientX;
      y0 = t.clientY;
      ultimo = { d: 0, t: e.timeStamp };
      velocidade = 0;
      arrastando = false;
    };
    const toque = (e: TouchEvent) => [...e.changedTouches].find((t) => t.identifier === id);
    const move = (e: TouchEvent) => {
      const t = id == null ? undefined : toque(e);
      if (!t) return;
      if (e.touches.length > 1) {
        id = null;
        if (arrastando) atual.current.onMover(null);
        arrastando = false;
        return;
      }
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;
      if (!arrastando) {
        if (!gestoComecou(Math.abs(dx), dy)) {
          // Rolagem vertical clara: o dedo é do conteúdo.
          if (Math.abs(dy) > 12) id = null;
          return;
        }
        // O navegador já tomou o dedo para rolar (o evento não é mais cancelável): é rolagem, não troca de camada.
        if (!e.cancelable) {
          id = null;
          return;
        }
        arrastando = true;
      }
      if (e.cancelable) e.preventDefault();
      const dt = e.timeStamp - ultimo.t;
      if (dt > 0) velocidade = (dx - ultimo.d) / dt;
      ultimo = { d: dx, t: e.timeStamp };
      atual.current.onMover(deslocamentoCarrossel(dx, atual.current.indice, atual.current.total));
    };
    const up = (e: TouchEvent) => {
      if (id == null || !toque(e)) return;
      id = null;
      if (!arrastando) return;
      arrastando = false;
      if (e.cancelable) e.preventDefault();
      const { indice: i, total: n, onMover: mover, onTrocar: trocar } = atual.current;
      mover(null);
      if (e.type !== "touchend") return;
      const alvo = camadaAoSoltar(i, n, ultimo.d, el.clientWidth, velocidade);
      if (alvo !== i) trocar(alvo);
    };
    el.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up, { passive: false });
    window.addEventListener("touchcancel", up);
    return () => {
      el.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
    };
  }, [ref, ativo]);
}
