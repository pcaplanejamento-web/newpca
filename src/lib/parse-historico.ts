import { type HistoricoParseado, lerCsv, parseHistoricoCompra } from "./historico-compra-core.ts";

/**
 * Leitura do arquivo do HISTÓRICO DE COMPRA — roda NO NAVEGADOR. CSV (o export do sistema de compras, UTF-8 com BOM; se
 * não for UTF-8 válido, Windows-1252) ou a mesma planilha em .xlsx/.xls (SheetJS, importado só aqui). A interpretação é
 * do núcleo puro `parseHistoricoCompra`.
 */
export async function parseHistoricoArquivo(file: File): Promise<HistoricoParseado> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const buf = await file.arrayBuffer();
  if (ext === "csv" || ext === "txt") {
    let texto: string;
    try {
      texto = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      texto = new TextDecoder("windows-1252").decode(buf);
    }
    return parseHistoricoCompra(lerCsv(texto));
  }
  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    let wb: import("xlsx").WorkBook;
    try {
      wb = XLSX.read(buf);
    } catch {
      throw new Error("Não consegui ler a planilha. Confirme que é um .xlsx válido.");
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error("A planilha está vazia ou sem abas.");
    return parseHistoricoCompra(XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false }));
  }
  throw new Error("Formato não suportado. Envie o .csv exportado do sistema de compras (ou a mesma planilha em .xlsx).");
}
