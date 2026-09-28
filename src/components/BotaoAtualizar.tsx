"use client";

import { useRef, useState } from "react";
import { Button } from "./Button";
import { IconRefresh } from "./icons";

/** Uma volta completa do `animate-spin` — o giro nunca para no meio (a recarga rápida ainda mostra o movimento). */
const VOLTA_MS = 1000;

/**
 * Estado do GIRO de uma ação assíncrona: `girar(fn)` liga o giro, roda a ação e só o desliga depois de ao menos uma
 * volta; um 2º toque enquanto gira é ignorado (nunca roda a ação duas vezes).
 */
export function useGiro() {
  const [girando, setGirando] = useState(false);
  const ocupado = useRef(false);
  async function girar(acao: () => Promise<void>) {
    if (ocupado.current) return;
    ocupado.current = true;
    setGirando(true);
    const inicio = Date.now();
    try {
      await acao();
    } finally {
      const resto = VOLTA_MS - (Date.now() - inicio);
      if (resto > 0) await new Promise((r) => setTimeout(r, resto));
      ocupado.current = false;
      setGirando(false);
    }
  }
  return { girando, girar };
}

/**
 * ATUALIZAR dos banners gravados (DFD, item e protocolo): recarrega do banco e REVISA os dados — trata o que for
 * possível (os mesmos tratamentos automáticos da importação). O ÍCONE GIRA enquanto trabalha. Alvo de 44px no celular.
 */
export function BotaoAtualizar({ girando, onClick }: { girando: boolean; onClick: () => void }) {
  return (
    <Button
      variant="icon"
      aria-label="Atualizar e revisar"
      aria-busy={girando || undefined}
      title={girando ? "Atualizando e revisando os dados…" : "Atualizar: recarrega do banco e revisa os dados (trata o que for possível)"}
      onClick={girando ? undefined : onClick}
    >
      <IconRefresh className={`h-5 w-5 ${girando ? "animate-spin" : ""}`} />
    </Button>
  );
}
