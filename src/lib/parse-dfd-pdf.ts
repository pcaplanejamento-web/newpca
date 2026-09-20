import type { Assinatura, DfdParseado } from "./parse-dfd-comum.ts";
import { ehCandidatoOcr, type PdfItem, parseDfdFromPdfItems } from "./parse-dfd-pdf-core.ts";
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
  /** Texto RENDERIZADO da página (via `getOperatorList`) — inclui a APARÊNCIA das anotações de
   * assinatura (widgets `Sig`), que o `getTextContent` (pageItems) NÃO traz. Usado só para
   * capturar a assinatura Dropsigner; mais caro, então chame só quando precisar (por DFD). */
  pageRenderText: (page: number) => Promise<string>;
  /** `true` se a página desenha alguma IMAGEM (`paintImageXObject`) — sinal (com o carimbo achatado)
   * de que vale rodar OCR (ver `ehCandidatoOcr`). Só navegador; usado para o Formato E (Foxit). */
  temImagem: (page: number) => Promise<boolean>;
  /** Rasteriza a página num `<canvas>` na escala dada (p/ o OCR do carimbo Foxit). Só navegador. */
  renderPagina: (page: number, scale: number) => Promise<HTMLCanvasElement>;
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

  const OPS = pdfjs.OPS;
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
    async pageRenderText(p: number) {
      // getOperatorList RENDERIZA a página (inclui a aparência das anotações de assinatura,
      // que o getTextContent ignora). Concatena o texto das operações `showText`.
      const page = await doc.getPage(p);
      const opList = await page.getOperatorList();
      let texto = "";
      for (let i = 0; i < opList.fnArray.length; i++) {
        if (opList.fnArray[i] !== OPS.showText) continue;
        const glyphs = opList.argsArray[i][0];
        if (!Array.isArray(glyphs)) continue;
        for (const g of glyphs) {
          if (g && typeof g === "object" && "unicode" in g) texto += (g as { unicode: string }).unicode;
          else if (typeof g === "number" && g < -100) texto += " "; // espaçamento largo → espaço
        }
        texto += " ";
      }
      page.cleanup();
      return texto.replace(/\s+/g, " ");
    },
    async temImagem(p: number) {
      const page = await doc.getPage(p);
      const opList = await page.getOperatorList();
      let tem = false;
      for (const fn of opList.fnArray) {
        if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageXObjectRepeat) {
          tem = true;
          break;
        }
      }
      page.cleanup();
      return tem;
    },
    async renderPagina(p: number, scale: number) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas 2d indisponível");
      await page.render({ canvasContext: ctx, viewport }).promise;
      page.cleanup();
      return canvas;
    },
    destroy: () => task.destroy(),
  };
}

/**
 * OCR do carimbo **Foxit/ICP-Brasil** (Formato E) nas páginas dadas — só quando o parse de texto NÃO
 * achou assinatura (o chamador garante isso). Percorre as páginas de trás p/ frente (a assinatura fica
 * na seção final do DFD), pula as que não são candidatas (`ehCandidatoOcr`) e devolve a 1ª leitura.
 * Best-effort: qualquer erro é engolido pelo `ocrAssinaturasDoCanvas` (o OCR é auxiliar). Só navegador.
 */
export async function ocrFoxitEmPaginas(
  doc: PdfDoc,
  pages: number[],
  scale = 4,
  maxPaginas = 2,
): Promise<Assinatura[]> {
  const { ocrAssinaturasDoCanvas } = await import("./ocr-assinatura.ts");
  const ordem = [...pages].reverse().slice(0, maxPaginas); // últimas páginas primeiro
  for (const p of ordem) {
    try {
      if (!ehCandidatoOcr(false, { temImagem: await doc.temImagem(p) })) continue;
      const canvas = await doc.renderPagina(p, scale);
      const ass = await ocrAssinaturasDoCanvas(canvas, scale);
      if (ass.length > 0) return ass;
    } catch {
      /* best-effort — o OCR nunca quebra o import */
    }
  }
  return [];
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
  const doc = await abrirPdf(file);
  try {
    const items: PdfItem[] = [];
    for (let p = 1; p <= doc.numPages; p++) items.push(...(await doc.pageItems(p)));
    // Separa as vias: um PDF de protocolo (capa/vários DFDs) NÃO entra pela via do DFD.
    const tipo = classificarPdf(paginasDeItens(items));
    if (tipo === "protocolo") {
      throw new Error("Isto é um PROTOCOLO (vários DFDs) — importe pela aba Protocolos.");
    }
    if (tipo === "desconhecido") {
      throw new Error('Não reconheci um DFD neste PDF. Envie o DFD emitido (com "Número DFD").');
    }
    // Texto renderizado POR PÁGINA (aparência das anotações de assinatura) — para o Dropsigner
    // parear cada bloco ao código da própria página e manter só o documento primário (o DFD).
    const render: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) render.push(await doc.pageRenderText(p));
    const parsed = parseDfdFromPdfItems(items, file.name, render);
    // Formato E — Foxit/ICP-Brasil ACHATADO: sem assinatura de texto → tenta OCR do carimbo (lazy).
    if (parsed.assinaturas.length === 0) {
      const paginas = Array.from({ length: doc.numPages }, (_, i) => i + 1);
      const ocr = await ocrFoxitEmPaginas(doc, paginas);
      if (ocr.length > 0) return { ...parsed, assinaturas: ocr };
    }
    return parsed;
  } finally {
    await doc.destroy();
  }
}
