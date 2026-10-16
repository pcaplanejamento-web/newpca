"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { chaveColunasXlsx, colunasXlsxIniciais } from "@/lib/exportar-tabela";
import { Button } from "./Button";
import { Checkbox } from "./Field";
import { IconDownload, IconFile } from "./icons";
import { Modal } from "./Modal";

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

/**
 * A ESCOLHA DAS COLUNAS do XLSX (antes de baixar): todas as colunas exportáveis da tabela, na ordem dela, com as do PDF
 * (as visíveis) já marcadas — o usuário altera. A escolha fica NESTE aparelho por tabela (vale de novo enquanto as
 * colunas não mudarem); "Padrão" volta às do PDF.
 */
export function EscolherColunasXlsx({
  aberto,
  nome,
  colunas,
  onFechar,
  onBaixar,
}: {
  aberto: boolean;
  nome: string;
  /** Na ordem da tabela; `padrao` = entra no PDF (visível). */
  colunas: { chave: string; titulo: string; padrao: boolean }[];
  onFechar: () => void;
  onBaixar: (chaves: string[]) => void;
}) {
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const todas = colunas.map((c) => c.chave);
  const padrao = colunas.filter((c) => c.padrao).map((c) => c.chave);
  // biome-ignore lint/correctness/useExhaustiveDependencies: relê a escolha só ao abrir
  useEffect(() => {
    if (!aberto) return;
    let salvas: unknown = null;
    try {
      salvas = JSON.parse(localStorage.getItem(chaveColunasXlsx(nome)) ?? "null");
    } catch {}
    setMarcadas(colunasXlsxIniciais(todas, padrao, salvas));
  }, [aberto]);
  const alternar = (k: string) => setMarcadas((m) => (m.includes(k) ? m.filter((x) => x !== k) : todas.filter((x) => x === k || m.includes(x))));
  function baixar() {
    try {
      if (marcadas.join("|") === padrao.join("|")) localStorage.removeItem(chaveColunasXlsx(nome));
      else localStorage.setItem(chaveColunasXlsx(nome), JSON.stringify(marcadas));
    } catch {}
    onBaixar(marcadas);
  }
  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      titulo="Colunas do XLSX"
      size="md"
      rodape={
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-muted">
            {marcadas.length} de {todas.length} colunas
          </span>
          <span className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setMarcadas(todas)}>
              Todas
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMarcadas(padrao)} title="As colunas do PDF (as visíveis na tabela)">
              Padrão
            </Button>
            <Button size="sm" variant="primary" disabled={!marcadas.length} icon={<IconDownload className="h-4 w-4" />} onClick={baixar}>
              Baixar
            </Button>
          </span>
        </div>
      }
    >
      <div className="grid gap-1 sm:grid-cols-2">
        {colunas.map((c) => (
          <Checkbox key={c.chave} label={c.titulo} checked={marcadas.includes(c.chave)} onChange={() => alternar(c.chave)} />
        ))}
      </div>
    </Modal>
  );
}
