import { type CatalogoParseado, parseCatalogoFromPdfItems } from "./parse-catalogo-pdf-core.ts";
import { extractPdfItems } from "./parse-dfd-pdf.ts";

/**
 * Parser de CATÁLOGO em PDF — roda NO NAVEGADOR. Reaproveita a camada pdf.js do parser
 * de DFD (`extractPdfItems`, com pdf.js importado dinamicamente) e delega a reconstrução
 * ao núcleo puro `parse-catalogo-pdf-core`. Um catálogo é um documento ÚNICO (dezenas de
 * páginas, não milhares) → extrai tudo de uma vez (sem o streaming de protocolo).
 */
export type { CatalogoItemParseado, CatalogoParseado } from "./parse-catalogo-pdf-core.ts";

export async function parseCatalogoPdf(file: File): Promise<CatalogoParseado> {
  const items = await extractPdfItems(file);
  return parseCatalogoFromPdfItems(items, file.name);
}
