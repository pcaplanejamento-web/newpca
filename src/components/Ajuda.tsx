"use client";

import type { ReactNode } from "react";
import { Dropdown } from "./Dropdown";
import { IconAjuda } from "./icons";

/**
 * AJUDA (?) — um botão discreto com o ícone de interrogação (na altura dos controles; 44px no toque) que abre, num painel
 * flutuante, a explicação de uma tela ou ferramenta. Tira os textos de instrução da tela: fica limpo e a explicação
 * continua a um toque. O conteúdo é livre (`children`); `titulo` abre o painel.
 */
export function Ajuda({
  titulo,
  children,
  rotulo = "Ajuda",
  compacta = false,
  botao = false,
}: {
  titulo: string;
  children: ReactNode;
  rotulo?: string;
  /** COMPACTA: o "(?)" pequeno AO LADO DO RÓTULO de um campo (visual de 20px, área de toque de 44px) — abre à esquerda. */
  compacta?: boolean;
  /** BOTÃO: o "(?)" no MESMO desenho dos botões só-ícone (`Button variant="icon"`) — numa barra deles; `true` = `xs`. */
  botao?: boolean | "xs" | "sm";
}) {
  return (
    <Dropdown
      ariaLabel={`${rotulo}: ${titulo}`}
      title={`${rotulo}: ${titulo}`}
      align={compacta ? "start" : "end"}
      width={compacta ? 300 : 360}
      triggerClassName={
        botao
          ? `h-11 w-11 shrink-0 justify-center !rounded-control border border-border-2 bg-surface text-text-2 transition-colors hover:bg-surface-2 ${
              botao === "sm" ? "lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]" : "lg:h-[calc(var(--h-control-sm)-6px)] lg:w-[calc(var(--h-control-sm)-6px)]"
            }`
          : compacta
          ? "relative h-5 w-5 justify-center rounded-full text-muted transition-colors after:absolute after:-inset-3 after:content-[''] hover:text-accent"
          : "h-11 w-11 shrink-0 justify-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-text lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
      }
      trigger={<IconAjuda className={compacta || botao ? "h-4 w-4" : "h-[18px] w-[18px]"} />}
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
