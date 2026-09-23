import { type Caixa, caixasImagensDaOpList, mesclarAssinaturasOcr, precisaOcr } from "./ocr-assinatura-core.ts";
import type { Assinatura, DfdParseado } from "./parse-dfd-comum.ts";
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
  /** Texto RENDERIZADO da página (via `getOperatorList`) — inclui a APARÊNCIA das anotações de
   * assinatura (widgets `Sig`), que o `getTextContent` (pageItems) NÃO traz. Usado só para
   * capturar a assinatura Dropsigner; mais caro, então chame só quando precisar (por DFD). */
  pageRenderText: (page: number) => Promise<string>;
  /** Caixas (0..1, topo-esquerdo) das IMAGENS da página — apontam o carimbo achatado (logo do Dropsigner,
   * rubrica) p/ o OCR ler só aquela região. Só navegador. */
  imagensPagina: (page: number) => Promise<Caixa[]>;
  /** Rasteriza a página num `<canvas>` na escala dada (p/ o OCR de assinaturas achatadas). Só navegador. */
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
          const [a, b, c, d, e, f] = it.transform;
          // `rot` = texto não horizontal (marca d'água vertical); `h` = corpo da fonte; `w` = largura.
          items.push({ page: p, x: e, y: f, str: it.str, rot: Math.abs(b) > Math.abs(a) * 0.1, w: it.width, h: Math.hypot(c, d) });
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
    async imagensPagina(p: number) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const opList = await page.getOperatorList();
      page.cleanup();
      return caixasImagensDaOpList(opList.fnArray, opList.argsArray, OPS, { largura: vp.width, altura: vp.height });
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
 * OCR das assinaturas **achatadas** (Dropsigner/Foxit/Adobe virados imagem/vetor) nas páginas de UM DFD —
 * em QUALQUER página, em ordem de prioridade (ver `lerAssinaturasPorOcr`). O chamador só aciona quando não
 * há assinatura NOMEADA de texto (`precisaOcr`). Best-effort garantido AQUI para todos os chamadores: falha
 * ao carregar o chunk do OCR (ChunkLoadError — rede instável) ou ao rodá-lo → `[]`. Só navegador.
 */
export async function ocrAssinaturasEmPaginas(doc: PdfDoc, pages: number[]): Promise<Assinatura[]> {
  try {
    const { lerAssinaturasOcr } = await import("./ocr-assinatura.ts");
    return await lerAssinaturasOcr(doc, pages);
  } catch {
    return [];
  }
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
    // Assinatura ACHATADA (sem camada de texto): nenhuma assinatura NOMEADA de texto → OCR (lazy).
    if (precisaOcr(parsed.assinaturas)) {
      const paginas = Array.from({ length: doc.numPages }, (_, i) => i + 1);
      const ocr = await ocrAssinaturasEmPaginas(doc, paginas);
      return { ...parsed, assinaturas: mesclarAssinaturasOcr(parsed.assinaturas, ocr) };
    }
    return parsed;
  } finally {
    await doc.destroy();
  }
}
