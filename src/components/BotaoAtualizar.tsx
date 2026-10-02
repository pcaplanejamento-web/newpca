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

/**
 * REVERIFICAR TUDO (a barra das Mesas): o quadrado da barra com um ANEL de progresso em volta do ícone que GIRA enquanto
 * a Mesa recarrega e reconfere protocolos, DFDs e itens. `progresso` 0–1 enche o anel (null = indeterminado: o arco gira).
 * Parado, só o ícone. 44px no celular, a altura da barra no desktop.
 */
export function BotaoReverificar({
  ativo,
  progresso,
  detalhe,
  onClick,
}: {
  ativo: boolean;
  progresso: number | null;
  /** O que está sendo feito ("Reconferindo 120 de 500…") — dica e leitor de tela. */
  detalhe?: string;
  onClick: () => void;
}) {
  const R = 15;
  const C = 2 * Math.PI * R;
  const p = progresso == null ? 0.25 : Math.max(0.02, Math.min(1, progresso));
  return (
    <button
      type="button"
      aria-label={ativo ? `Reverificando a Mesa${detalhe ? ` — ${detalhe}` : ""}` : "Atualizar e reverificar toda a Mesa"}
      aria-busy={ativo || undefined}
      title={ativo ? (detalhe ?? "Reverificando protocolos, DFDs e itens…") : "Atualizar tudo: recarrega a Mesa e reconfere todos os protocolos, DFDs e itens"}
      onClick={ativo ? undefined : onClick}
      className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)] ${
        ativo ? "border-accent/50 bg-accent-soft text-accent" : "border-border-2 bg-surface text-muted hover:bg-surface-2 hover:text-text-2"
      }`}
    >
      {ativo && (
        <svg viewBox="0 0 36 36" aria-hidden="true" className={`absolute inset-0.5 ${progresso == null ? "animate-spin" : ""}`}>
          <circle cx="18" cy="18" r={R} fill="none" stroke="var(--border)" strokeWidth="2.5" />
          <circle
            cx="18"
            cy="18"
            r={R}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - p)}
            transform="rotate(-90 18 18)"
            style={{ transition: "stroke-dashoffset var(--motion-duration, 200ms) ease" }}
          />
        </svg>
      )}
      <IconRefresh className={`relative h-4 w-4 ${ativo ? "animate-spin" : ""}`} />
    </button>
  );
}
