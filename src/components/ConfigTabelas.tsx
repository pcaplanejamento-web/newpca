"use client";

import { createContext, type ReactNode, useContext } from "react";
import { LINHAS_TABELA_PADRAO, type LinhasTabela } from "@/lib/theme";

const LinhasTabelaCtx = createContext<LinhasTabela>(LINHAS_TABELA_PADRAO);

/**
 * Configuração das TABELAS definida pelo ADM (Configurações → Tabelas) para toda a área logada: as LINHAS POR PÁGINA com
 * que as tabelas de rolagem interna (a Mesa) abrem — o `DataTable` lê daqui (sem provedor = o padrão de fábrica, 30).
 * Módulo leve (só o contexto): o layout o usa sem carregar a tabela nas telas que não têm uma.
 */
export function ConfigTabelas({ linhas, children }: { linhas: LinhasTabela; children: ReactNode }) {
  return <LinhasTabelaCtx.Provider value={linhas}>{children}</LinhasTabelaCtx.Provider>;
}

/** As linhas por página iniciais das tabelas (a escolha do ADM). */
export const useLinhasTabela = () => useContext(LinhasTabelaCtx);
