"use client";

import type { ReactNode } from "react";
import { Dropdown } from "./Dropdown";
import { IconAjuda } from "./icons";

/**
 * AJUDA (?) — um botão discreto com o ícone de interrogação (na altura dos controles; 44px no toque) que abre, num painel
 * flutuante, a explicação de uma tela ou ferramenta. Tira os textos de instrução da tela: fica limpo e a explicação
 * continua a um toque. O conteúdo é livre (`children`); `titulo` abre o painel.
 */
export function Ajuda({ titulo, children, rotulo = "Ajuda" }: { titulo: string; children: ReactNode; rotulo?: string }) {
  return (
    <Dropdown
      ariaLabel={`${rotulo}: ${titulo}`}
      align="end"
      width={360}
      triggerClassName="grid h-11 w-11 place-items-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-text lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
      trigger={<IconAjuda className="h-[18px] w-[18px]" />}
    >
      <div className="space-y-3 p-1.5 text-[13px] leading-relaxed text-text-2">
        <p className="text-[14px] font-semibold text-text">{titulo}</p>
        {children}
      </div>
    </Dropdown>
  );
}

/** Um tópico da ajuda: ícone + título curto + a explicação. */
export function TopicoAjuda({ icone, titulo, children }: { icone?: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div className="flex gap-2.5">
      {icone && <span className="mt-0.5 shrink-0 text-accent">{icone}</span>}
      <div className="min-w-0">
        <p className="font-medium text-text">{titulo}</p>
        <p className="text-muted">{children}</p>
      </div>
    </div>
  );
}
