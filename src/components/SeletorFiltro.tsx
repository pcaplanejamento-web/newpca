"use client";

import type { ReactNode } from "react";
import { Dropdown } from "./Dropdown";
import { IconCheck } from "./icons";

/** O QUADRADO só-ícone dos filtros de hierarquia (na altura dos controles; 44px no toque) — accent quando ativo. O mesmo
 * no `SeletorPessoa` (o filtro Responsável, com a foto da escolhida). */
export const classeQuadradoFiltro = (ativo: boolean) =>
  `relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border transition-colors focus-within:ring-2 focus-within:ring-accent/40 lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)] ${
    ativo ? "border-accent/50 bg-accent-soft text-accent" : "border-border-2 bg-surface text-muted hover:bg-surface-2 hover:text-text-2"
  }`;

/**
 * SELETOR DE FILTRO de hierarquia (na linha das visões da Mesa — Responsável e Assunto; Documentos — PCA): SÓ O ÍCONE, num
 * quadrado na ALTURA PADRÃO dos controles (`--h-control-sm` no desktop; 44px no toque). ATIVO (fora do "todos") fica em
 * accent; quem usa pode trocar o ícone pelo que representa a escolha (ex.: a FOTO da pessoa). Tocar abre a lista do
 * SISTEMA (`Dropdown`): a escolhida em accent com o check; o nome acessível e a dica dizem o filtro e o valor.
 */
export function SeletorFiltro({
  icone,
  rotulo,
  valor,
  opcoes,
  onChange,
  ativo,
}: {
  /** O que aparece no quadrado (ícone, ou a foto da pessoa escolhida). */
  icone: ReactNode;
  rotulo: string;
  valor: string;
  opcoes: { valor: string; rotulo: string }[];
  onChange: (valor: string) => void;
  /** Filtro aplicado (fora do valor "todos") — destacado. */
  ativo: boolean;
}) {
  // Valor fora das opções (não deveria acontecer): aparece como ele mesmo — nunca como a 1ª opção ("Todos").
  const lista = opcoes.some((o) => o.valor === valor) ? opcoes : [...opcoes, { valor, rotulo: valor }];
  const atual = lista.find((o) => o.valor === valor)?.rotulo ?? "";
  return (
    <Dropdown
      papel="listbox"
      align="end"
      width={260}
      ariaLabel={`Filtro: ${rotulo} — ${atual}`}
      title={`${rotulo}: ${atual}`}
      triggerClassName={classeQuadradoFiltro(ativo)}
      trigger={icone}
    >
      {(fechar) => (
        <div className="max-h-80 overflow-y-auto p-1">
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{rotulo}</p>
          {lista.map((o) => {
            const sel = o.valor === valor;
            return (
              <button
                key={o.valor}
                type="button"
                role="option"
                aria-selected={sel}
                onClick={() => {
                  onChange(o.valor);
                  fechar();
                }}
                className={`flex min-h-11 w-full items-center gap-2 rounded-control px-2.5 text-left text-[13px] lg:min-h-8 ${
                  sel ? "font-semibold text-accent" : "text-text-2 hover:bg-surface-2"
                }`}
              >
                <span className="min-w-0 flex-1 break-words">{o.rotulo}</span>
                {sel && <IconCheck className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </Dropdown>
  );
}
