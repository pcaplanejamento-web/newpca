import type { DfdParseado } from "./parse-dfd-comum.ts";
import { type PdfItem, parseDfdFromPdfItems } from "./parse-dfd-pdf-core.ts";

/**
 * Parser do DFD em PDF — roda NO NAVEGADOR. Usa o `pdf.js` (`pdfjs-dist`),
 * importado DINAMICAMENTE (fica fora do bundle inicial e do Worker, como o
 * SheetJS). Extrai os trechos de texto com posição e delega a reconstrução ao
 * núcleo puro `parse-dfd-pdf-core.ts`.
 */
export type { DfdParseado, DfdItemParseado } from "./parse-dfd-comum.ts";
export type { PdfItem } from "./parse-dfd-pdf-core.ts";

let workerPronto = false;

/**
 * Extrai os TRECHOS de texto posicionados (`{page,x,y,str}`) de um PDF, no
 * navegador, via pdf.js (importado dinamicamente — fora do bundle do Worker).
 * Compartilhado pelo parser de DFD e pelo de PROTOCOLO (bundle de vários DFDs).
 */
export async function extractPdfItems(file: File): Promise<PdfItem[]> {
  const buf = await file.arrayBuffer();
  const pdfjs = await import("pdfjs-dist");
  if (!workerPronto) {
    // O worker é empacotado pelo bundler (não depende de CDN em runtime).
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    workerPronto = true;
  }

  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  } catch {
    throw new Error("Não consegui ler o PDF. Confirme que é um PDF com texto (não digitalizado).");
  }

  const items: PdfItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if ("str" in it && it.str?.trim()) {
        items.push({ page: p, x: it.transform[4], y: it.transform[5], str: it.str });
      }
    }
  }
  return items;
}

export async function parseDfdPdf(file: File): Promise<DfdParseado> {
  return parseDfdFromPdfItems(await extractPdfItems(file), file.name);
}
