"use client";

import type { ReactNode } from "react";
import { IconFluxo } from "../icons";

/** A LARGURA fixa do cartão: o formato nunca muda (abrir o painel "Novo fluxo" só muda quantos cabem por linha). */
export const LARGURA_CARTAO = "17rem";

/** A grade dos cartões de automação (a mesma na lista e no painel "Novo fluxo"): colunas de largura FIXA, vão padrão. */
export const GRADE_CARTOES = "grid gap-[var(--gap-block)] [grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),17rem))]";

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
      className={`flex h-48 flex-col gap-2 overflow-hidden rounded-card border bg-surface p-[var(--pad-card)] text-left shadow-ring transition-[box-shadow,transform,border-color] duration-[var(--motion-duration)] ease-[var(--motion-ease)] hover:-translate-y-0.5 hover:shadow-soft motion-reduce:hover:translate-y-0 focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
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
