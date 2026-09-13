import type { DfdParseado } from "./parse-dfd-comum.ts";
import { type PdfItem, parseDfdFromPdfItems } from "./parse-dfd-pdf-core.ts";
import { classificarPdf, paginasDeItens } from "./parse-protocolo-pdf-core.ts";

/**
 * Parser do DFD em PDF — roda NO NAVEGADOR. Usa o `pdf.js` (`pdfjs-dist`),
 * importado DINAMICAMENTE (fica fora do bundle inicial e do Worker, como o
 * SheetJS). Extrai os trechos de texto com posição e delega a reconstrução ao
 * núcleo puro `parse-dfd-pdf-core.ts`.
 */
export type { DfdParseado, DfdItemParseado } from "./parse-dfd-comum.ts";
export type { PdfItem } from "./parse-dfd-pdf-core.ts";

/**
 * Documento PDF aberto (streaming): o buffer/documento fica em memória UMA vez e
 * as páginas são lidas SOB DEMANDA (`pageItems`) — para importar protocolos
 * enormes sem acumular os trechos de todas as páginas (evita OOM do navegador).
 */
export type PdfDoc = {
  numPages: number;
  pageItems: (page: number) => Promise<PdfItem[]>;
  destroy: () => Promise<void>;
};

let workerPronto = false;

/** Abre o PDF no navegador (pdf.js dinâmico) e devolve um handle streamável. */
export async function abrirPdf(file: File): Promise<PdfDoc> {
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

  // O `destroy` fica na LOADING TASK (não no PDFDocumentProxy) — guardamos a task.
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch {
    throw new Error("Não consegui ler o PDF. Confirme que é um PDF com texto (não digitalizado).");
  }

  return {
    numPages: doc.numPages,
    async pageItems(p: number) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const items: PdfItem[] = [];
      for (const it of tc.items) {
        if ("str" in it && it.str?.trim()) {
          items.push({ page: p, x: it.transform[4], y: it.transform[5], str: it.str });
        }
      }
      page.cleanup(); // libera os recursos da página (streaming)
      return items;
    },
    destroy: () => task.destroy(),
  };
}

/**
 * Extrai TODOS os trechos de um PDF (conveniência para PDFs pequenos — 1 DFD).
 * Para protocolos grandes use `abrirPdf` + `pageItems` (streaming).
 */
export async function extractPdfItems(file: File): Promise<PdfItem[]> {
  const doc = await abrirPdf(file);
  try {
    const items: PdfItem[] = [];
    for (let p = 1; p <= doc.numPages; p++) items.push(...(await doc.pageItems(p)));
    return items;
  } finally {
    await doc.destroy();
  }
}

export async function parseDfdPdf(file: File): Promise<DfdParseado> {
  const items = await extractPdfItems(file);
  // Separa as vias: um PDF de protocolo (capa/vários DFDs) NÃO entra pela via do DFD.
  const tipo = classificarPdf(paginasDeItens(items));
  if (tipo === "protocolo") {
    throw new Error("Isto é um PROTOCOLO (vários DFDs) — importe pela aba Protocolos.");
  }
  if (tipo === "desconhecido") {
    throw new Error('Não reconheci um DFD neste PDF. Envie o DFD emitido (com "Número DFD").');
  }
  return parseDfdFromPdfItems(items, file.name);
}
