import * as XLSX from "xlsx";
import type { OrcamentoParseado } from "./parse-orcamento-comum.ts";
import { parseOrcamentoFromMatriz } from "./parse-orcamento-xlsx-core.ts";

/**
 * Parser de ORÇAMENTO em PLANILHA (.xlsx/.xls) — roda NO NAVEGADOR (SheetJS fica fora do
 * bundle do Worker, como o parser de Catálogo/DFD). Lê com `raw:false` p/ o TEXTO formatado
 * (o núcleo converte os valores) e delega ao núcleo puro.
 */
export type { OrcamentoItemParseado, OrcamentoParseado } from "./parse-orcamento-comum.ts";

export async function parseOrcamentoXlsx(file: File): Promise<OrcamentoParseado> {
  const buf = await file.arrayBuffer();
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { cellDates: true });
  } catch {
    throw new Error("Não consegui ler a planilha. Confirme que é um .xlsx válido.");
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("A planilha está vazia ou sem abas.");
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: null, blankrows: true });
  return parseOrcamentoFromMatriz(aoa, file.name);
}
