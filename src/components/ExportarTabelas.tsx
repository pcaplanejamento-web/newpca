"use client";

import { createContext, type ReactNode, useContext } from "react";
import { Button } from "./Button";
import { IconDownload, IconFile } from "./icons";

/**
 * EXPORTAR TABELAS — toda tabela do sistema baixa os dados em .xlsx ou .pdf. A PERMISSÃO segue o papel: a tela que o
 * papel não deixa exportar envolve o conteúdo em `PermissaoExportar permitido={false}` (o contexto vale também nos
 * banners abertos por portal); sem provedor, exporta (a Administração e a consulta pública).
 */
const PodeExportarCtx = createContext(true);

export function PermissaoExportar({ permitido, children }: { permitido: boolean; children: ReactNode }) {
  return <PodeExportarCtx.Provider value={permitido}>{children}</PodeExportarCtx.Provider>;
}

export const usePodeExportar = () => useContext(PodeExportarCtx);

export type FormatoExportacao = "xlsx" | "pdf";

/**
 * Os botões de EXPORTAR do RODAPÉ das tabelas (`DataTable`, tabela cruzada): **XLSX** e **PDF** lado a lado — as linhas
 * filtradas, com as colunas à vista. `nome` entra no nome acessível; `carregando` = o formato sendo gerado (os dois
 * travam). Compactos (`size="sm"`): 44px no celular.
 */
export function BotaoExportar({
  nome,
  disabled = false,
  carregando = null,
  onExportar,
}: {
  nome: string;
  disabled?: boolean;
  carregando?: FormatoExportacao | null;
  onExportar: (formato: FormatoExportacao) => void;
}) {
  const botao = (formato: FormatoExportacao, rotulo: string, dica: string) => (
    <Button
      size="sm"
      variant="secondary"
      disabled={disabled || (carregando != null && carregando !== formato)}
      loading={carregando === formato}
      onClick={() => onExportar(formato)}
      icon={formato === "pdf" ? <IconFile className="h-4 w-4" /> : <IconDownload className="h-4 w-4" />}
      aria-label={`Baixar ${nome} em ${rotulo}`}
      title={dica}
    >
      {rotulo}
    </Button>
  );
  return (
    <span className="inline-flex items-center gap-1.5">
      {botao("xlsx", "XLSX", "Baixar as linhas filtradas, com as colunas à vista, em planilha (.xlsx)")}
      {botao("pdf", "PDF", "Baixar as linhas filtradas, com as colunas à vista, em PDF (A4 deitado)")}
    </span>
  );
}
