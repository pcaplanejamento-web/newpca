import * as XLSX from "xlsx";

/**
 * Exportação de um catálogo (o menu do CARD e o modelo de importação) — roda NO NAVEGADOR, `.xlsx` via SheetJS (fora do
 * bundle do Worker). A tabela aberta exporta pelo rodapé da `DataTable` (XLSX/PDF).
 */
export type CatalogoItemExport = {
  sequencial: number | null;
  codigo: string;
  codigoRaw: string | null;
  descricao: string;
  unidade: string | null;
  tipos: string[];
};

const nomeSeguro = (s: string) => s.replace(/[^\p{L}\p{N}\-_ ]+/gu, "").trim().slice(0, 80) || "catalogo";

/** Baixa o catálogo como planilha .xlsx (códigos como texto p/ preservar a precisão). */
export function exportarCatalogoXlsx(nome: string, itens: CatalogoItemExport[]) {
  const aoa: (string | number)[][] = [
    ["Item", "Código", "Descrição", "Unidade de Medida", "Tipos de DFD"],
    ...itens.map((it) => [
      it.sequencial ?? "",
      it.codigoRaw ?? it.codigo, // string → SheetJS mantém como texto (sem notação científica)
      it.descricao,
      it.unidade ?? "",
      it.tipos.join(", "),
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 6 }, { wch: 16 }, { wch: 70 }, { wch: 18 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Catálogo");
  XLSX.writeFile(wb, `${nomeSeguro(nome)}.xlsx`);
}

/** Baixa um MODELO .xlsx (cabeçalho + 1 linha de exemplo) para o usuário preencher e importar. */
export function exportarModeloCatalogoXlsx() {
  const aoa: (string | number)[][] = [
    ["Item", "Código", "Descrição", "Unidade de Medida"],
    ["1", "000000001", "EXEMPLO — apague esta linha e preencha com os seus itens", "UNIDADE"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 6 }, { wch: 16 }, { wch: 72 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Catálogo");
  XLSX.writeFile(wb, "modelo-catalogo.xlsx");
}

