"use client";

import { createContext, type ReactNode, useCallback, useContext } from "react";
import { LINHAS_TABELA_PADRAO, type LinhasTabela } from "@/lib/theme";

const LinhasTabelaCtx = createContext<LinhasTabela>(LINHAS_TABELA_PADRAO);
const QuemCtx = createContext<string | null>(null);
const NomesCtx = createContext<Record<string, string>>({});

/**
 * Configuração das TABELAS definida pelo ADM (Configurações → Tabelas) para toda a área logada: as LINHAS POR PÁGINA com
 * que as tabelas de rolagem interna (a Mesa) abrem — o `DataTable` lê daqui (sem provedor = o padrão de fábrica, 30).
 * — e QUEM está logado (o rodapé do PDF exportado diz quem baixou). Módulo leve (só o contexto): o layout o usa sem
 * carregar a tabela nas telas que não têm uma.
 */
export function ConfigTabelas({
  linhas,
  quem = null,
  nomesUnidades = {},
  children,
}: {
  linhas: LinhasTabela;
  quem?: string | null;
  /** SIGLA → NOME das unidades e órgãos: o filtro das colunas de unidade/sigla mostra e busca pelos dois. */
  nomesUnidades?: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <LinhasTabelaCtx.Provider value={linhas}>
      <QuemCtx.Provider value={quem}>
        <NomesCtx.Provider value={nomesUnidades}>{children}</NomesCtx.Provider>
      </QuemCtx.Provider>
    </LinhasTabelaCtx.Provider>
  );
}

/** Quem está logado ("Nome (matrícula N)") — sem provedor (tela pública), `null`. */
export const useQuemExporta = () => useContext(QuemCtx);

/** As linhas por página iniciais das tabelas (a escolha do ADM). */
export const useLinhasTabela = () => useContext(LinhasTabelaCtx);

const COLUNA_SIGLA = /sigla|unidade|reparti|[óo]rg[ãa]o/i;
const NAO_SIGLA = /medida|unid\.|cadastrada|planilha/i;

/** O ÚNICO ponto das colunas de UNIDADE/ÓRGÃO/SIGLA: pelo título da coluna, a função que dá o NOME de cada sigla (a 2ª
 * linha do filtro, que também busca por ele) — `undefined` nas demais colunas (nunca a unidade de MEDIDA). */
export function useDetalheSigla() {
  const nomes = useContext(NomesCtx);
  const detalhe = useCallback((o: string) => nomes[o], [nomes]);
  return useCallback((titulo: string) => (COLUNA_SIGLA.test(titulo) && !NAO_SIGLA.test(titulo) ? detalhe : undefined), [detalhe]);
}
