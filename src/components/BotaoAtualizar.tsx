"use client";

import { useRef, useState } from "react";
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
 * ATUALIZAR — o botão PADRÃO de recarregar/reverificar do sistema (circular): o quadrado na altura da barra com o ícone
 * que GIRA dentro de um ANEL enquanto trabalha. `progresso` 0–1 enche o anel (null/ausente = indeterminado: o arco gira).
 * Usos: a barra das Mesas (reverifica protocolos, DFDs e itens, com o andamento), os banners gravados de DFD, item e
 * protocolo (recarrega e revisa — com `useGiro`) e o "Recarregar" das telas de administração. 44px no celular.
 */
export function BotaoAtualizar({
  ativo,
  progresso = null,
  rotulo,
  dica,
  detalhe,
  onClick,
}: {
  ativo: boolean;
  progresso?: number | null;
  /** Nome acessível parado (ex.: "Recarregar"). */
  rotulo: string;
  /** A dica parada (padrão = o rótulo). */
  dica?: string;
  /** O que está sendo feito ("Reconferindo 120 de 500…") — dica e leitor de tela enquanto gira. */
  detalhe?: string;
  onClick: () => void;
}) {
  const R = 15;
  const C = 2 * Math.PI * R;
  const p = progresso == null ? 0.25 : Math.max(0.02, Math.min(1, progresso));
  const fazendo = detalhe ?? "Atualizando…";
  return (
    <button
      type="button"
      aria-label={ativo ? `${rotulo} — ${fazendo}` : rotulo}
      aria-busy={ativo || undefined}
      title={ativo ? fazendo : (dica ?? rotulo)}
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
