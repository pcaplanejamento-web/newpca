"use client";

import type { ReactNode } from "react";
import { Dropdown } from "./Dropdown";

/**
 * O PAINEL PADRÃO DOS SELOS — tocar num selo de estado (Convergente, Falhou, Executado, Executando…) abre este painel PRESO
 * ao selo (o `Dropdown papel="dialog"`), nunca um banner de tela inteira. O conteúdo segue o `PainelSelo`: o título, a linha
 * de contexto (a data, o que roda agora), o corpo (a mensagem inteira, a lista) e as ações embaixo, separadas por uma linha.
 * O painel PARA o clique: numa célula de tabela, o toque não abre a linha de trás.
 */
export function SeloComPainel({
  selo,
  ariaLabel,
  title,
  width = 460,
  align,
  children,
}: {
  /** O selo (um `Badge`) — o gatilho. */
  selo: ReactNode;
  /** O nome acessível do painel. */
  ariaLabel: string;
  /** A dica do selo. */
  title?: string;
  width?: number;
  align?: "start" | "end";
  /** O conteúdo (em regra um `PainelSelo`); em função recebe o `fechar`. */
  children: ReactNode | ((fechar: () => void) => ReactNode);
}) {
  return (
    <Dropdown
      papel="dialog"
      ariaLabel={ariaLabel}
      title={title}
      width={width}
      align={align}
      triggerClassName="cursor-pointer min-h-11 desktop:min-h-0 hover:opacity-80"
      trigger={selo}
    >
      {(fechar) => (
        <div role="none" className="-m-2 p-2" onClick={(e) => e.stopPropagation()}>
          {typeof children === "function" ? children(fechar) : children}
        </div>
      )}
    </Dropdown>
  );
}

/** O CONTEÚDO padrão do painel do selo: título (13px) com uma ação à direita · linha de contexto (12px) · corpo · ações. */
export function PainelSelo({
  titulo,
  extra,
  linha,
  linhaTom = "muted",
  children,
  acoes,
}: {
  titulo: ReactNode;
  /** Uma ação ao lado do título (ex.: Copiar). */
  extra?: ReactNode;
  /** A linha de contexto: quando foi conferido, o que roda agora… */
  linha?: ReactNode;
  linhaTom?: "muted" | "warn" | "danger";
  children?: ReactNode;
  /** Os botões embaixo (`Button size="sm"`), separados por uma linha. */
  acoes?: ReactNode;
}) {
  const cor = linhaTom === "warn" ? "text-[var(--warn)]" : linhaTom === "danger" ? "text-[var(--danger)]" : "text-muted";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-[13px] font-semibold text-text">{titulo}</p>
        {extra}
      </div>
      {linha && <p className={`break-words text-[12px] ${cor}`}>{linha}</p>}
      {children}
      {acoes && <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">{acoes}</div>}
    </div>
  );
}

/** Uma lista de MENSAGENS do painel (as divergências, o motivo de uma falha): uma por linha, com o ponto na cor. */
export function ListaMensagens({ itens, cor = "var(--danger)", riscado = false }: { itens: string[]; cor?: string; riscado?: boolean }) {
  return (
    <ol className="space-y-1">
      {itens.map((it, i) => (
        <li key={i} className="flex gap-2 rounded-control bg-surface-2 px-2 py-1.5 text-[12.5px] leading-snug text-text">
          <span aria-hidden="true" className="mt-[5px] size-1.5 shrink-0 rounded-full" style={{ background: cor }} />
          <span className={`min-w-0 whitespace-pre-wrap break-words ${riscado ? "text-muted line-through" : ""}`}>{it}</span>
        </li>
      ))}
    </ol>
  );
}
