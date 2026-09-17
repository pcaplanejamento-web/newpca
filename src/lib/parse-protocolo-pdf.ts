import { abrirPdf, type PdfDoc } from "./parse-dfd-pdf.ts";
import { linhasDeTexto, type PdfItem, parseDfdFromPdfItems } from "./parse-dfd-pdf-core.ts";
import {
  type DfdIndexado,
  ehCapa,
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
    const lines = linhasDeTexto(items);
    // Geometria descartada por página (índice leve, memória O(nº DFDs)) — EXCETO a da CAPA,
    // guardada p/ a extração coluna-aware dos campos multi-linha (Interessado etc.).
    paginas.push(ehCapa(lines) ? { page: p, lines, items } : { page: p, lines });
  }
  return { index: indexarProtocolo(paginas, file.name), doc };
}

export async function parseDfdDoProtocolo(doc: PdfDoc, dfd: DfdIndexado, nomeArquivo: string) {
  const items: PdfItem[] = [];
  for (const p of dfd.pages) items.push(...(await doc.pageItems(p)));
  // As páginas do DFD não incluem a página de assinatura (fica fora de `pages`);
  // as assinaturas vêm do índice (`dfd.assinaturas`).
  return { ...parseDfdFromPdfItems(items, nomeArquivo), assinaturas: dfd.assinaturas };
}
