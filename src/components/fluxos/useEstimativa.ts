"use client";

import { useEffect, useRef, useState } from "react";
import { type Amostra, registrarAmostra, tempoRestanteMs } from "@/lib/fluxo-progresso";

/** O tempo restante AO VIVO de uma execução: amostra a fração a cada mudança e recalcula a cada segundo. */
export function useEstimativa(fracao: number, rodando: boolean): number | null {
  const amostras = useRef<Amostra[]>([]);
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!rodando) {
      amostras.current = [];
      return;
    }
    amostras.current = registrarAmostra(amostras.current, { t: Date.now(), f: fracao });
  }, [fracao, rodando]);
  useEffect(() => {
    if (!rodando) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [rodando]);
  return rodando ? tempoRestanteMs(amostras.current, agora) : null;
}
