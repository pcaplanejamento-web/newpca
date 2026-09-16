import * as XLSX from "xlsx";
import type { CatalogoParseado } from "./parse-catalogo-comum.ts";
import { parseCatalogoFromMatriz } from "./parse-catalogo-xlsx-core.ts";

/**
 * Parser de CATÁLOGO em PLANILHA (.xlsx/.xls) — roda NO NAVEGADOR (SheetJS fica fora
 * do bundle do Worker, como no parser de DFD). Lê com `raw:false` p/ o TEXTO formatado
 * (preserva o código longo como string) e delega ao núcleo puro.
 */
export type { CatalogoItemParseado, CatalogoParseado } from "./parse-catalogo-comum.ts";

export async function parseCatalogoXlsx(file: File): Promise<CatalogoParseado> {
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
  return parseCatalogoFromMatriz(aoa, file.name);
}
