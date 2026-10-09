"use client";

import { createContext, type ReactNode, useContext } from "react";
import { LINHAS_TABELA_PADRAO, type LinhasTabela } from "@/lib/theme";

const LinhasTabelaCtx = createContext<LinhasTabela>(LINHAS_TABELA_PADRAO);
const QuemCtx = createContext<string | null>(null);

/**
 * Configuração das TABELAS definida pelo ADM (Configurações → Tabelas) para toda a área logada: as LINHAS POR PÁGINA com
 * que as tabelas de rolagem interna (a Mesa) abrem — o `DataTable` lê daqui (sem provedor = o padrão de fábrica, 30).
 * — e QUEM está logado (o rodapé do PDF exportado diz quem baixou). Módulo leve (só o contexto): o layout o usa sem
 * carregar a tabela nas telas que não têm uma.
 */
export function ConfigTabelas({ linhas, quem = null, children }: { linhas: LinhasTabela; quem?: string | null; children: ReactNode }) {
  return (
    <LinhasTabelaCtx.Provider value={linhas}>
      <QuemCtx.Provider value={quem}>{children}</QuemCtx.Provider>
    </LinhasTabelaCtx.Provider>
  );
}

/** Quem está logado ("Nome (matrícula N)") — sem provedor (tela pública), `null`. */
export const useQuemExporta = () => useContext(QuemCtx);

/** As linhas por página iniciais das tabelas (a escolha do ADM). */
export const useLinhasTabela = () => useContext(LinhasTabelaCtx);
