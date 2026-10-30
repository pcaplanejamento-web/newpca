"use client";

import { useRef, useState } from "react";
import { IconRefresh } from "./icons";
import { toast } from "./Toast";

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
 * `discreto` = pequeno, sem moldura, no canto de um cartão (o "Importar agora" das KPIs da Execução): 24px no desktop, 28px
 * no toque com a área de toque ampliada a 44px.
 */
export function BotaoAtualizar({
  ativo,
  progresso = null,
  rotulo,
  dica,
  detalhe,
  onClick,
  disabled = false,
  discreto = false,
  aviso,
  dadosDe = null,
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
  /** Travado (ex.: gravando, sobrescrita em andamento): fica À VISTA, sem agir — a dica diz o motivo. */
  disabled?: boolean;
  discreto?: boolean;
  /** Travado COM O MOTIVO ao alcance (também no celular, que não tem dica): esmaecido e o toque mostra o aviso flutuante. */
  aviso?: string;
  /** Quando os dados à vista foram buscados do servidor (o guardado do navegador): o selo discreto "dados de hh:mm". */
  dadosDe?: number | null;
}) {
  const R = 15;
  const C = 2 * Math.PI * R;
  const p = progresso == null ? 0.25 : Math.max(0.02, Math.min(1, progresso));
  const fazendo = detalhe ?? "Atualizando…";
  const selo = dadosDe ? textoDadosDe(dadosDe) : null;
  const botao = (
    <button
      type="button"
      aria-label={ativo ? `${rotulo} — ${fazendo}` : rotulo}
      aria-busy={ativo || undefined}
      title={ativo ? fazendo : `${aviso ?? dica ?? rotulo}${selo ? ` · ${selo}` : ""}`}
      onClick={ativo ? undefined : aviso ? () => toast.info(aviso) : onClick}
      disabled={disabled && !ativo}
      aria-disabled={(!ativo && !!aviso) || undefined}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-control border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${
        discreto
          ? "h-7 w-7 after:absolute after:-inset-2 lg:h-6 lg:w-6 lg:after:hidden pointer-coarse:after:block"
          : "h-11 w-11 lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
      } ${
        ativo
          ? "border-accent/50 bg-accent-soft text-accent"
          : discreto
            ? "border-transparent bg-transparent text-faint hover:bg-surface-2 hover:text-text-2"
            : "border-border-2 bg-surface text-muted hover:bg-surface-2 hover:text-text-2"
      }`}
    >
      {ativo && (
        <span aria-hidden="true" className={`absolute inset-0.5 ${progresso == null ? "animate-girar" : ""}`}>
        <svg viewBox="0 0 36 36" aria-hidden="true" className="h-full w-full">
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
        </span>
      )}
      <span aria-hidden="true" className={`relative inline-flex ${ativo ? "animate-girar" : ""}`}>
        <IconRefresh className={discreto ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </span>
    </button>
  );
  if (!selo) return botao;
  return (
    <span className="inline-flex items-center gap-1.5">
      {botao}
      <span className="hidden whitespace-nowrap text-[11px] tabular-nums text-faint sm:inline">{selo}</span>
    </span>
  );
}

/** "Dados de 10:42" (hoje) ou "Dados de 28/10 10:42" — o horário de Brasília. */
export function textoDadosDe(em: number): string {
  const fuso = { timeZone: "America/Sao_Paulo" } as const;
  const hora = new Date(em).toLocaleTimeString("pt-BR", { ...fuso, hour: "2-digit", minute: "2-digit" });
  const dia = (d: Date) => d.toLocaleDateString("pt-BR", { ...fuso, day: "2-digit", month: "2-digit" });
  return dia(new Date(em)) === dia(new Date()) ? `Dados de ${hora}` : `Dados de ${dia(new Date(em))} ${hora}`;
}
