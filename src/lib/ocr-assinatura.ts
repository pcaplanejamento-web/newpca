import { type Caixa, type LeituraOcr, type MotorOcr, binarizarRgba, lerAssinaturasPorOcr, type OpcoesRecorte } from "./ocr-assinatura-core.ts";
import type { Assinatura } from "./parse-dfd-comum.ts";

/**
 * Adaptador de NAVEGADOR do OCR de assinaturas achatadas (Dropsigner/Foxit/Adobe virados imagem/vetor —
 * sem camada de texto e sem `/Sig`). Implementa o `MotorOcr` com o pdf.js (render/imagens/camada de texto
 * do `PdfDoc`), o `<canvas>` do DOM e o **tesseract.js** (WASM, idioma `por`); toda a lógica (páginas,
 * localização, recortes, parse, votação) está no núcleo `ocr-assinatura-core.ts` — o MESMO código validado
 * por harness contra o PDF real.
 *
 * - **Lazy**: o tesseract.js é importado DINAMICAMENTE (fora do bundle inicial e do Worker) e o worker só é
 *   criado quando um DFD fica sem assinatura NOMEADA de texto. DFDs já assinados em texto nunca o carregam.
 * - **Assets self-hosted** em `/public/tesseract` (worker + core WASM SIMD-LSTM + `por.traineddata.gz`) —
 *   sem CDN externa (a rede da Prefeitura pode bloqueá-la); ver `docs/OCR-ASSINATURA.md`.
 * - **Best-effort**: qualquer erro (sem SIMD, asset ausente, leitura ruim) → `[]` — o OCR NUNCA quebra a
 *   importação (o DFD só continua "sem assinatura", como antes deste recurso).
 */

const TESS_BASE = "/tesseract";

/** O mínimo do `PdfDoc` de que o OCR precisa (evita acoplar ao tipo completo). */
export type DocOcr = {
  renderPagina(page: number, scale: number): Promise<HTMLCanvasElement>;
  imagensPagina(page: number): Promise<Caixa[]>;
  pageItems(page: number): Promise<{ str: string }[]>;
};

// biome-ignore lint/suspicious/noExplicitAny: o tesseract.js é carregado dinâmico (browser-only), sem tipos no bundle.
type Tess = any;

let workerP: Promise<{ worker: Tess; PSM: Record<string, number> }> | null = null;

async function getWorker() {
  if (!workerP) {
    workerP = (async () => {
      const t: Tess = await import("tesseract.js");
      const lib = t.createWorker ? t : t.default;
      const worker = await lib.createWorker("por", lib.OEM?.LSTM_ONLY ?? 1, {
        workerPath: `${TESS_BASE}/worker.min.js`,
        corePath: `${TESS_BASE}/tesseract-core-simd-lstm.wasm.js`,
        langPath: `${TESS_BASE}/lang`,
        gzip: true,
      });
      return { worker, PSM: lib.PSM ?? { AUTO: 3, SINGLE_BLOCK: 6, SPARSE_TEXT: 11 } };
    })().catch((e) => {
      workerP = null; // permite nova tentativa num próximo DFD
      throw e;
    });
  }
  return workerP;
}

/** Encerra o worker do OCR (libera a thread/WASM). Best-effort — chamar ao fim de uma importação. */
export async function encerrarOcr(): Promise<void> {
  const p = workerP;
  workerP = null;
  try {
    if (p) await (await p).worker.terminate();
  } catch {
    /* nada a fazer */
  }
}

function recortar(src: HTMLCanvasElement, k: Caixa, up: number, opts?: OpcoesRecorte): HTMLCanvasElement {
  const w = Math.max(1, Math.round(k.x1 - k.x0));
  const h = Math.max(1, Math.round(k.y1 - k.y0));
  const W = Math.max(1, Math.round(w * up));
  const H = Math.max(1, Math.round(h * up));
  const c = document.createElement("canvas");
  c.width = opts?.girar ? H : W;
  c.height = opts?.girar ? W : H;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  if (opts?.girar) {
    ctx.translate(H, 0);
    ctx.rotate(Math.PI / 2);
  }
  ctx.drawImage(src, Math.round(k.x0), Math.round(k.y0), w, h, 0, 0, W, H);
  if (opts?.binarizar) {
    const img = ctx.getImageData(0, 0, c.width, c.height);
    binarizarRgba(img.data, opts.binarizar);
    ctx.putImageData(img, 0, 0);
  }
  return c;
}

/**
 * Lê por OCR as assinaturas achatadas das páginas de UM DFD (qualquer página, em ordem de prioridade — ver
 * `lerAssinaturasPorOcr`). Devolve `Assinatura[]` com `ocr:true` (normalmente 0 ou 1). Best-effort: `[]`.
 */
export async function lerAssinaturasOcr(doc: DocOcr, paginas: number[]): Promise<Assinatura[]> {
  try {
    const { worker, PSM } = await getWorker();
    const motor: MotorOcr<HTMLCanvasElement> = {
      render: (p, escala) => doc.renderPagina(p, escala),
      dims: (c) => ({ w: c.width, h: c.height }),
      recortar,
      async ler(c, modo): Promise<LeituraOcr> {
        await worker.setParameters({
          tessedit_pageseg_mode: modo === "pagina" ? PSM.AUTO : modo === "esparso" ? PSM.SPARSE_TEXT : PSM.SINGLE_BLOCK,
        });
        const r = await worker.recognize(c, {}, { blocks: modo === "pagina" });
        const palavras: LeituraOcr["palavras"] = [];
        for (const b of r?.data?.blocks ?? [])
          for (const pa of b?.paragraphs ?? [])
            for (const l of pa?.lines ?? []) for (const w of l?.words ?? []) if (w?.bbox) palavras.push({ text: String(w.text ?? ""), bbox: w.bbox });
        return { texto: String(r?.data?.text ?? ""), palavras };
      },
      imagens: (p) => doc.imagensPagina(p),
      textoCamada: async (p) => (await doc.pageItems(p)).map((i) => i.str).join(" "),
    };
    return await lerAssinaturasPorOcr(motor, paginas);
  } catch {
    return []; // OCR é auxiliar — nunca quebra o import.
  }
}
