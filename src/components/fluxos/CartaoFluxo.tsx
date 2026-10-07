"use client";

import type { ReactNode } from "react";
import { IconFluxo } from "../icons";

/**
 * O CARTÃO de uma automação — o MESMO na lista dos fluxos salvos e no painel "Novo fluxo" (modelos e "Em branco"):
 * ícone + título INTEIRO (quebra linha, nunca corta) + selo, a descrição em até 3 linhas e o rodapé (nós, frequência,
 * a última execução). O cartão inteiro é o botão (44px+ no toque); `marcado` = o escolhido.
 */
export function CartaoFluxo({
  titulo,
  descricao,
  selo,
  rodape,
  marcado,
  tracejado,
  onClick,
}: {
  titulo: string;
  descricao?: string | null;
  selo?: ReactNode;
  rodape?: ReactNode;
  marcado?: boolean;
  /** Ainda não é um fluxo salvo (modelo / em branco). */
  tracejado?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={marcado}
      className={`flex h-full min-h-[8.5rem] flex-col gap-2 rounded-card border bg-surface p-[var(--pad-card)] text-left shadow-ring transition-shadow hover:shadow-soft focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
        marcado ? "border-accent bg-[var(--accent-soft)]" : tracejado ? "border-dashed border-border" : "border-border"
      }`}
    >
      <span className="flex items-start gap-2">
        <IconFluxo className={`mt-0.5 size-5 shrink-0 ${tracejado && !marcado ? "text-muted" : "text-accent"}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 break-words font-semibold leading-snug text-text">{titulo}</span>
        {selo && <span className="shrink-0">{selo}</span>}
      </span>
      {descricao && <span className="line-clamp-3 text-xs text-muted">{descricao}</span>}
      {rodape && <span className="mt-auto space-y-0.5 text-xs text-muted">{rodape}</span>}
    </button>
  );
}
