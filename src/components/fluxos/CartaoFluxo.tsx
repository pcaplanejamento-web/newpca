"use client";

import type { ReactNode } from "react";
import { IconFluxo } from "../icons";

/** A grade dos cartões de automação (a mesma na lista e no painel "Novo fluxo"): vão padrão do sistema. */
export const GRADE_CARTOES = "grid gap-[var(--gap-block)] [grid-template-columns:repeat(auto-fill,minmax(min(100%,16rem),1fr))]";

/**
 * O CARTÃO de uma automação — o MESMO na lista dos fluxos salvos e no painel "Novo fluxo" (modelos e "Em branco"): sólido
 * e de FORMATO FIXO (a mesma altura sempre): ícone + título (até 3 linhas) + selo, a descrição em até 2 linhas e o rodapé
 * (nós, frequência, a última execução). O cartão inteiro é o botão (44px+ no toque); `marcado` = o escolhido.
 */
export function CartaoFluxo({
  titulo,
  descricao,
  selo,
  rodape,
  marcado,
  onClick,
}: {
  titulo: string;
  descricao?: string | null;
  selo?: ReactNode;
  rodape?: ReactNode;
  marcado?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={marcado}
      title={titulo}
      className={`flex h-48 flex-col gap-2 overflow-hidden rounded-card border bg-surface p-[var(--pad-card)] text-left shadow-ring transition-shadow hover:shadow-soft focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
        marcado ? "border-accent shadow-[0_0_0_1px_var(--accent)]" : "border-border"
      }`}
    >
      <span className="flex items-start gap-2">
        <IconFluxo className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <span className="line-clamp-3 min-w-0 flex-1 break-words font-semibold leading-snug text-text">{titulo}</span>
        {selo && <span className="shrink-0">{selo}</span>}
      </span>
      {descricao && <span className="line-clamp-2 text-xs text-muted">{descricao}</span>}
      {rodape && <span className="mt-auto space-y-0.5 text-xs text-muted">{rodape}</span>}
    </button>
  );
}
