"use client";

import { useEffect, useRef, useState } from "react";

/** Duração (ms) de uma SAÍDA: o `--motion-fast` do tema (0 com "reduzir movimento"/motion desligado). */
export function duracaoSaidaMs(): number {
  if (typeof window === "undefined") return 0;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return 0;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--motion-duration").trim();
  const n = Number.parseFloat(v);
  const base = Number.isFinite(n) ? (v.endsWith("ms") ? n : n * 1000) : 200;
  return Math.round(base * 0.6);
}

/**
 * SAÍDA ANIMADA padrão do sistema: quando `aberto` vira falso, o elemento continua montado por `--motion-fast` com
 * `saindo` = true (a tela põe `data-saindo` e o CSS toca a saída) e só então desmonta. Sem movimento, desmonta na hora.
 * Reaberto no meio da saída, volta a ficar aberto (sem piscar).
 */
export function useSaida(aberto: boolean): { montado: boolean; saindo: boolean } {
  const [saindo, setSaindo] = useState(false);
  const antes = useRef(aberto);
  useEffect(() => {
    const eraAberto = antes.current;
    antes.current = aberto;
    if (aberto) {
      setSaindo(false);
      return;
    }
    if (!eraAberto) return;
    const ms = duracaoSaidaMs();
    if (ms <= 0) return;
    setSaindo(true);
    const t = window.setTimeout(() => setSaindo(false), ms + 20);
    return () => window.clearTimeout(t);
  }, [aberto]);
  // No MESMO desenho em que `aberto` vira falso, `saindo` ainda não foi ligado pelo efeito: conta como saindo para o
  // elemento não sumir por um quadro.
  const fechandoAgora = !aberto && antes.current && duracaoSaidaMs() > 0;
  return { montado: aberto || saindo || fechandoAgora, saindo: !aberto && (saindo || fechandoAgora) };
}
