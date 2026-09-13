import { extractPdfItems } from "./parse-dfd-pdf.ts";
import { type ProtocoloParseado, parseProtocoloFromPdfItems } from "./parse-protocolo-pdf-core.ts";

/**
 * Parser do PROTOCOLO em PDF (bundle de vários DFDs) — roda NO NAVEGADOR.
 * Reaproveita a extração de trechos do pdf.js (`extractPdfItems`) e delega a
 * reconstrução ao núcleo puro `parse-protocolo-pdf-core.ts`.
 */
export type {
  ProtocoloParseado,
  ProtocoloMeta,
  ProtocoloDfdErro,
} from "./parse-protocolo-pdf-core.ts";
export type { DfdParseado } from "./parse-dfd-comum.ts";

export async function parseProtocoloPdf(file: File): Promise<ProtocoloParseado> {
  return parseProtocoloFromPdfItems(await extractPdfItems(file), file.name);
}
