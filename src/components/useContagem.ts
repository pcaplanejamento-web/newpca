"use client";

import { useEffect, useRef, useState } from "react";

/** Movimento reduzido (sistema ou a preferência do ADM — `data-motion`). */
function semMovimento(): boolean {
  if (typeof window === "undefined") return true;
  const m = document.documentElement.dataset.motion;
  return m === "off" || m === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * O número CORRE até o valor novo (os KPIs do Dashboard ao filtrar): sai do valor anterior e chega ao novo em `ms` com
 * desaceleração. No 1º desenho e com movimento reduzido, mostra o valor direto (o HTML do servidor já vem certo).
 */
export function useContagem(alvo: number, ms = 650): number {
  const [valor, setValor] = useState(alvo);
  const atual = useRef(alvo);
  useEffect(() => {
    const de = atual.current;
    if (de === alvo || semMovimento()) {
      atual.current = alvo;
      setValor(alvo);
      return;
    }
    let raf = 0;
    const inicio = performance.now();
    const passo = (t: number) => {
      const p = Math.min(1, (t - inicio) / ms);
      const e = 1 - (1 - p) ** 3;
      const v = de + (alvo - de) * e;
      atual.current = v;
      setValor(v);
      if (p < 1) raf = requestAnimationFrame(passo);
      else atual.current = alvo;
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo, ms]);
  return valor;
}
