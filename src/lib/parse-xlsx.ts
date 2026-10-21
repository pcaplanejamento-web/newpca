import * as XLSX from "xlsx";
import { type LeituraPlanilhas, lerPlanilhas } from "./parse-xlsx-core";

export type { LeituraPlanilhas, LinhaCruaUpload, PlanilhaParseada, ProblemaPlanilha } from "./parse-xlsx-core";

/**
 * Leitura da planilha do PCA de lista pronta — roda NO NAVEGADOR (o SheetJS fica fora do bundle do Worker). A regra está
 * no núcleo puro `parse-xlsx-core.ts` (por unidade ou CONSOLIDADA por LOCAL); a normalização final é do servidor.
 */
export async function parsePlanilhas(file: File): Promise<LeituraPlanilhas> {
  const buf = await file.arrayBuffer();
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { cellDates: true });
  } catch {
    throw new Error("Não consegui ler o arquivo. Confirme que é um .xlsx válido.");
  }
  const ws = wb.Sheets.Pca ?? wb.Sheets.DADOSPCA ?? wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("A planilha está vazia ou sem abas.");
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
  return lerPlanilhas(aoa, file.name);
}
