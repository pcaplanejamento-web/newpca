"use client";

import type { ReactNode } from "react";
import { IconChevronDown } from "./icons";

/**
 * SELETOR DE FILTRO de hierarquia (acima das tabelas — ex.: Responsável e Assunto da Mesa): um chip com
 * ícone, rótulo e o valor escolhido; ATIVO (fora do "todos") fica em accent. É um `<select>` nativo
 * transparente sobre o visual — acessível, com o seletor do próprio celular e alvo de toque de 44px (40px no
 * desktop, a altura do `Segmented` ao lado). No celular divide a linha com os vizinhos (`flex-1`) e mostra só o
 * ícone + o valor (o rótulo segue no nome acessível e na dica). Só tokens do design-system.
 */
export function SeletorFiltro({
  icone,
  rotulo,
  valor,
  opcoes,
  onChange,
  ativo,
}: {
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
      className={`relative inline-flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-control border px-3 text-[13px] transition-colors focus-within:ring-2 focus-within:ring-accent/40 sm:flex-none lg:min-h-10 ${
        ativo ? "border-accent/50 bg-accent-soft text-accent" : "border-border-2 bg-surface text-text-2 hover:bg-surface-2"
      }`}
    >
      <span className={`shrink-0 ${ativo ? "text-accent" : "text-muted"}`}>{icone}</span>
      <span className="hidden shrink-0 font-semibold sm:inline">{rotulo}:</span>
      <span className="min-w-0 flex-1 truncate sm:max-w-[16rem]">{atual}</span>
      <IconChevronDown className="h-4 w-4 shrink-0 opacity-70" />
      <select
        aria-label={`Filtro: ${rotulo}`}
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
