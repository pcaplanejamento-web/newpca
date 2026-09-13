import { abrirPdf, type PdfDoc } from "./parse-dfd-pdf.ts";
import { linhasDeTexto, type PdfItem, parseDfdFromPdfItems } from "./parse-dfd-pdf-core.ts";
import {
  type DfdIndexado,
  indexarProtocolo,
  type PaginaTexto,
  type ProtocoloIndex,
} from "./parse-protocolo-pdf-core.ts";

/**
 * Parser do PROTOCOLO em PDF (bundle de vários DFDs) — roda NO NAVEGADOR, em
 * STREAMING para escalar a milhares de DFDs:
 *  - `indexarProtocoloPdf`: abre o PDF e monta o ÍNDICE LEVE lendo página a página
 *    e DESCARTANDO a geometria de cada página (só o texto vai para o índice) →
 *    memória O(nº de DFDs). Devolve o índice + o documento aberto (`doc`).
 *  - `parseDfdDoProtocolo`: parse COMPLETO de UM DFD (suas páginas), sob demanda —
 *    para o "Ver" e para o import streamado. Nunca segura mais que 1 DFD por vez.
 * Quem chama é dono do `doc` e deve chamar `doc.destroy()` ao fechar.
 */
export type { ProtocoloMeta, DfdIndexado, ProtocoloIndex } from "./parse-protocolo-pdf-core.ts";
export type { DfdParseado } from "./parse-dfd-comum.ts";
export type { PdfDoc } from "./parse-dfd-pdf.ts";

export async function indexarProtocoloPdf(file: File): Promise<{ index: ProtocoloIndex; doc: PdfDoc }> {
  const doc = await abrirPdf(file);
  const paginas: PaginaTexto[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const items = await doc.pageItems(p);
    paginas.push({ page: p, lines: linhasDeTexto(items) });
    // `items` (geometria) é descartado aqui — só o texto (leve) fica no índice.
  }
  return { index: indexarProtocolo(paginas, file.name), doc };
}

export async function parseDfdDoProtocolo(doc: PdfDoc, dfd: DfdIndexado, nomeArquivo: string) {
  const items: PdfItem[] = [];
  for (const p of dfd.pages) items.push(...(await doc.pageItems(p)));
  return parseDfdFromPdfItems(items, nomeArquivo);
}
