import * as XLSX from "xlsx";

/**
 * Exportação da TABELA CRUZADA do comparativo do orçamento em .xlsx — roda NO NAVEGADOR (SheetJS, fora do bundle do
 * Worker). As demais tabelas exportam pelo rodapé da `DataTable` (XLSX/PDF).
 */

const nomeSeguro = (s: string) => s.replace(/[^\p{L}\p{N}\-_ ]+/gu, "").trim().slice(0, 80) || "orcamento";

/** Baixa a TABELA CRUZADA do comparativo (matriz pronta — `matrizCruzamento`) como .xlsx: 1ª coluna larga (+ a coluna
 * extra, se houver), valores como número. */
export function exportarCruzamentoXlsx(nome: string, matriz: (string | number)[][], comExtra: boolean) {
  const ws = XLSX.utils.aoa_to_sheet(matriz);
  ws["!cols"] = (matriz[0] ?? []).map((_, j) => ({ wch: j === 0 ? 48 : comExtra && j === 1 ? 14 : 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Comparativo");
  XLSX.writeFile(wb, `${nomeSeguro(nome)}.xlsx`);
}
