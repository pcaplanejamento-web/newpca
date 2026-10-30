"use client";

import Link from "next/link";
import { createContext, type ReactNode, useContext } from "react";
import { NOME_TIPO, type TipoCard } from "@/lib/empenho-cards-core";
import { AteOFim } from "./AlturaCheia";
import { IconSettings } from "./icons";

/** O atalho às Importações (só o ADM), posto pela tela na barra de botões da tabela. */
const AtalhoImportacoes = createContext<ReactNode>(null);
export const useAtalhoImportacoes = () => useContext(AtalhoImportacoes);

/**
 * Módulos EMPENHOS, LIQUIDAÇÕES e PAGAMENTOS — só os DADOS: a TABELA ÚNICA de todos os cards do tipo (montada pelo servidor
 * em `children`), sem título (as KPIs vêm primeiro). As IMPORTAÇÕES ficam em Configurações → Importações (só o ADM) — o
 * atalho vai na barra de botões da tabela (`useAtalhoImportacoes`).
 */
export function EmpenhosView({ tipo, importacoes, children }: { tipo: TipoCard; importacoes?: string; children: ReactNode }) {
  const nomeTipo = NOME_TIPO[tipo];
  const atalho = importacoes ? (
    <Link
      href={importacoes}
      title="Importações (Configurações)"
      aria-label={`Importações de ${nomeTipo.varios} (Configurações)`}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-control border border-border-2 bg-surface text-text-2 transition-colors hover:bg-surface-2 lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
    >
      <IconSettings className="h-4 w-4" />
    </Link>
  ) : null;
  return (
    <AtalhoImportacoes.Provider value={atalho}>
      <h1 className="sr-only">{nomeTipo.titulo}</h1>
      <AteOFim>{children}</AteOFim>
    </AtalhoImportacoes.Provider>
  );
}
