import * as XLSX from "xlsx";
import { type DfdParseado, parseDfdFromMatriz } from "./parse-dfd-core";

/**
 * Parser do DFD — roda NO NAVEGADOR (mantém o SheetJS fora do bundle do Worker).
 * Lê a planilha com `raw: false` para obter o TEXTO FORMATADO de cada célula (o
 * `.w` do SheetJS): assim o "Código" longo (ex.: 5241937263) preserva a grafia
 * exata (sem notação científica/perda de precisão) e as quantidades chegam como
 * texto pt-BR (normalizadas depois). A inteligência de extração fica no núcleo
 * puro `parse-dfd-core.ts` (testável).
 */
export type { DfdParseado, DfdItemParseado } from "./parse-dfd-core";

export async function parseDfd(file: File): Promise<DfdParseado> {
  const buf = await file.arrayBuffer();
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { cellDates: true });
  } catch {
    throw new Error("Não consegui ler o arquivo. Confirme que é um .xlsx válido.");
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("A planilha está vazia ou sem abas.");

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: false, // texto formatado (.w) — preserva códigos longos como string
    defval: null,
    blankrows: true,
  });

  return parseDfdFromMatriz(aoa, file.name);
}
