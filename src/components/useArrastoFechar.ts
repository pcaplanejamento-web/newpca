"use client";

import { type RefObject, useEffect, useRef } from "react";
import { deslocamento, deveFechar, gestoComecou } from "@/lib/gesto-fechar";

/**
 * FECHAR DESLIZANDO no toque — a folha que sobe de baixo (Modal no celular, `Dropdown` em folha) desce com o dedo; a
 * gaveta do menu vai para a esquerda. O painel segue o dedo e, ao soltar, fecha (passou de 30% ou saiu rápido) ou volta
 * com mola. Só o TOQUE (mouse e caneta seguem pelos botões/Esc) e só um dedo.
 * - `direcao` "baixo": o gesto começa na ALÇA/cabeçalho (`[data-alca-fechar]`, com `touch-action: none` — senão o
 *   navegador toma o dedo para rolar e cancela o gesto); arrastar no conteúdo só rola o conteúdo;
 * - `direcao` "esquerda": em qualquer ponto do painel (a gaveta, `touch-pan-y`: rola na vertical e o lado é do gesto),
 *   menos dentro de algo que rola de lado.
 * `ativo` = só quando o painel está aberto como folha/gaveta; `midia` = a media query em que o painel É folha (ex.: o
 * Modal só no celular — num tablet ele é o painel centrado e não desliza).
 */
export function useArrastoFechar(ref: RefObject<HTMLElement | null>, { direcao, onFechar, ativo = true, midia }: { direcao: "baixo" | "esquerda"; onFechar?: () => void; ativo?: boolean; midia?: string }) {
  // A função mais recente sem reinscrever os ouvintes (uma renderização no meio do arrasto não solta o painel).
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;
  const temFechar = !!onFechar;
  useEffect(() => {
    const el = ref.current;
    if (!el || !ativo || !temFechar) return;
    const vertical = direcao === "baixo";
    let id: number | null = null;
    let x0 = 0;
    let y0 = 0;
    let t0 = 0;
    let arrastando = false;
    let ultimo = { d: 0, t: 0 };
    let velocidade = 0;

    /** Algum ancestral (até o painel) rola de lado? Então o arrasto horizontal é dele. */
    const roladorOcupado = (alvo: Element | null): boolean => {
      for (let n = alvo; n && n !== el; n = n.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(n).overflowX) && n.scrollWidth > n.clientWidth + 1) return true;
      }
      return false;
    };
    const aplicar = (d: number) => {
      const v = deslocamento(d);
      // `translate` (não `transform`): as animações de entrada/saída usam `transform` com `both` e venceriam o estilo da
      // linha — com `translate` os dois se somam (e a saída parte de onde o dedo deixou).
      el.style.translate = vertical ? `0 ${v}px` : `${-v}px 0`;
    };
    const limpar = () => {
      el.style.transition = "";
      el.style.translate = "";
    };

    // TOQUE pelos eventos de touch (não de ponteiro): o `touchmove` não passivo segura a rolagem do navegador depois que o
    // gesto começa — com ponteiros, o navegador tomava o dedo para rolar e cancelava o gesto no 1º movimento.
    const down = (e: TouchEvent) => {
      if (id != null || e.touches.length !== 1) return;
      if (midia && !matchMedia(midia).matches) return;
      const alvo = e.target as Element | null;
      // Campos e controles de faixa não viram gesto (o dedo está escolhendo/digitando).
      if (alvo?.closest("input, textarea, select, [contenteditable], [role='slider']")) return;
      if (vertical ? !alvo?.closest("[data-alca-fechar]") : roladorOcupado(alvo)) return;
      const t = e.changedTouches[0];
      id = t.identifier;
      x0 = t.clientX;
      y0 = t.clientY;
      t0 = e.timeStamp;
      ultimo = { d: 0, t: t0 };
      velocidade = 0;
      arrastando = false;
    };
    const toque = (e: TouchEvent) => [...e.changedTouches].find((t) => t.identifier === id);
    const move = (e: TouchEvent) => {
      const t = id == null ? undefined : toque(e);
      if (!t) return;
      // Um 2º dedo (pinça) não é este gesto: solta.
      if (e.touches.length > 1) {
        if (arrastando) volta();
        id = null;
        arrastando = false;
        return;
      }
      const principal = vertical ? t.clientY - y0 : x0 - t.clientX;
      const cruzado = vertical ? t.clientX - x0 : t.clientY - y0;
      if (!arrastando) {
        if (!gestoComecou(principal, cruzado)) {
          // Movimento claro em outra direção = não é o gesto (rolagem, arrasto de lado): solta o dedo.
          if (Math.abs(cruzado) > 12 || principal < -12) id = null;
          return;
        }
        arrastando = true;
        el.style.transition = "none";
      }
      if (e.cancelable) e.preventDefault();
      const dt = e.timeStamp - ultimo.t;
      if (dt > 0) velocidade = (principal - ultimo.d) / dt;
      ultimo = { d: principal, t: e.timeStamp };
      aplicar(principal);
    };
    const volta = () => {
      // Volta com mola.
      el.style.transition = "translate var(--motion-duration) cubic-bezier(0.2, 0.9, 0.3, 1.2)";
      el.style.translate = "";
      setTimeout(limpar, 400);
    };
    const up = (e: TouchEvent) => {
      if (id == null || !toque(e)) return;
      id = null;
      if (!arrastando) return;
      arrastando = false;
      // O toque que terminou um arrasto não é clique (não abre nada embaixo do dedo).
      if (e.cancelable) e.preventDefault();
      const tamanho = vertical ? el.offsetHeight : el.offsetWidth;
      if (e.type === "touchend" && deveFechar(ultimo.d, tamanho, velocidade)) {
        // A saída animada padrão (useSaida) desce/desliza A PARTIR de onde o dedo deixou (o `translate` fica até desmontar).
        fecharRef.current?.();
        return;
      }
      volta();
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
      limpar();
    };
  }, [ref, direcao, temFechar, ativo, midia]);
}
