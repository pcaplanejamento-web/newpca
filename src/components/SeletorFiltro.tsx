"use client";

import type { ReactNode } from "react";

/**
 * SELETOR DE FILTRO de hierarquia (na linha das visões da Mesa — Responsável e Assunto): SÓ O ÍCONE, num quadrado na
 * ALTURA PADRÃO dos controles (`--h-control-sm` no desktop — a do `Segmented` ao lado; 44px no celular, o alvo de toque).
 * ATIVO (fora do "todos") fica em accent, e quem usa pode trocar o ícone pelo que representa a escolha (ex.: a FOTO da
 * pessoa). É um `<select>` nativo transparente sobre o visual — acessível (o nome diz o filtro e o valor escolhido), com o
 * seletor do próprio celular; a dica mostra o valor. Só tokens do design-system.
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
    <span
      className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border transition-colors focus-within:ring-2 focus-within:ring-accent/40 lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)] ${
        ativo ? "border-accent/50 bg-accent-soft text-accent" : "border-border-2 bg-surface text-muted hover:bg-surface-2 hover:text-text-2"
      }`}
    >
      {icone}
      <select
        aria-label={`Filtro: ${rotulo} — ${atual}`}
        title={`${rotulo}: ${atual}`}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {lista.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </span>
  );
}
