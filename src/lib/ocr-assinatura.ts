import type { Assinatura } from "./parse-dfd-comum.ts";
import { assinaturasFoxitDeTexto } from "./parse-dfd-pdf-core.ts";

/**
 * OCR do carimbo **Foxit/ICP-Brasil** (Formato E) — SÓ NO NAVEGADOR. O carimbo vem ACHATADO como
 * vetor/imagem (sem texto, sem `/Sig`), então nenhum parser de texto o lê; é obtido rasterizando a
 * página e lendo a região do carimbo com **tesseract.js** (WASM, idioma `por`).
 *
 * - **Lazy**: o tesseract.js é importado DINAMICAMENTE (fica fora do bundle inicial e do Worker) e o
 *   worker só é criado quando há um candidato (DFD sem assinatura de texto). O import normal (DFDs já
 *   assinados em texto) NUNCA carrega o motor de OCR.
 * - **Assets self-hosted** em `/public/tesseract` (worker + core WASM SIMD-LSTM + `por.traineddata.gz`)
 *   — sem depender de CDN externa (rede da Prefeitura pode bloqueá-la); ver `docs/OCR-ASSINATURA.md`.
 * - **Best-effort**: qualquer erro (sem SIMD, asset ausente, leitura ruim) → `[]` — o OCR é auxiliar e
 *   NUNCA quebra a importação (o DFD apenas continua "sem assinatura", como antes deste recurso).
 * - **2 passes**: (1) OCR da página inteira com bounding boxes p/ LOCALIZAR a caixa de detalhe do
 *   carimbo (o nome grande sobreposto corrompe a leitura direta); (2) OCR do RECORTE ampliado da caixa,
 *   isolando o texto limpo (CN=/Data). O parse fica em `assinaturasFoxitDeTexto` (puro/testável).
 */

const TESS_BASE = "/tesseract";

// Palavras que marcam a CAIXA DE DETALHE do carimbo Foxit (linhas pequenas e horizontais).
const RE_MARCA = /assinado|digitalmente|foxit|icp|brasil|data|reader|receita|federal|autor/i;

type TessBBox = { x0: number; y0: number; x1: number; y1: number };
type TessWord = { text?: string; bbox?: TessBBox };
// biome-ignore lint/suspicious/noExplicitAny: o tesseract.js é carregado dinâmico (browser-only), sem tipos no bundle.
type TessWorker = any;
type LienzoCanvas = HTMLCanvasElement;

let workerP: Promise<TessWorker> | null = null;

async function getWorker(): Promise<TessWorker> {
  if (!workerP) {
    workerP = (async () => {
      // biome-ignore lint/suspicious/noExplicitAny: import dinâmico do tesseract.js (fora do bundle do Worker).
      const t: any = await import("tesseract.js");
      const createWorker = t.createWorker ?? t.default?.createWorker;
      const OEM = t.OEM ?? t.default?.OEM ?? { LSTM_ONLY: 1 };
      return createWorker("por", OEM.LSTM_ONLY, {
        workerPath: `${TESS_BASE}/worker.min.js`,
        corePath: `${TESS_BASE}/tesseract-core-simd-lstm.wasm.js`,
        langPath: `${TESS_BASE}/lang`,
        gzip: true,
      });
    })().catch((e) => {
      workerP = null; // permite nova tentativa num próximo candidato
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
    if (p) await (await p).terminate();
  } catch {
    /* nada a fazer */
  }
}

/** Recorta um sub-retângulo do canvas, ampliando por `up` (mais nitidez p/ o OCR do texto pequeno). */
function recortar(src: LienzoCanvas, x: number, y: number, w: number, h: number, up: number): LienzoCanvas {
  const cw = Math.max(1, Math.round(w * up));
  const ch = Math.max(1, Math.round(h * up));
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext("2d");
  if (ctx) ctx.drawImage(src, Math.round(x), Math.round(y), Math.round(w), Math.round(h), 0, 0, cw, ch);
  return c;
}

/**
 * Extrai a assinatura Foxit/ICP-Brasil de UM canvas já renderizado (a página do DFD, em `scale` ~3–4).
 * Retorna as assinaturas achadas (normalmente 0 ou 1). Best-effort: qualquer erro → `[]`.
 */
export async function ocrAssinaturasDoCanvas(canvas: LienzoCanvas, scale: number): Promise<Assinatura[]> {
  try {
    const worker = await getWorker();
    // biome-ignore lint/suspicious/noExplicitAny: enum do tesseract.js carregado dinâmico.
    const t: any = await import("tesseract.js");
    const PSM = t.PSM ?? t.default?.PSM ?? { AUTO: 3, SINGLE_BLOCK: 6 };

    // PASSE 1 — página inteira, com bounding boxes de palavra (p/ localizar a caixa de detalhe).
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    const r1 = await worker.recognize(canvas, {}, { blocks: true });
    const texto1 = String(r1?.data?.text ?? "");
    const words: TessWord[] = [];
    for (const b of r1?.data?.blocks ?? [])
      for (const p of b?.paragraphs ?? [])
        for (const l of p?.lines ?? [])
          for (const w of l?.words ?? []) if (w?.bbox) words.push(w);

    // Palavras da caixa de detalhe: HORIZONTAIS (larg ≥ alt), PEQUENAS (o nome grande sobreposto é bem
    // maior) e com uma marca do carimbo. O limiar de altura acompanha a escala do render.
    const altMax = scale * 11;
    const marcas = words.filter((w) => {
      const bb = w.bbox as TessBBox;
      const wd = bb.x1 - bb.x0;
      const ht = bb.y1 - bb.y0;
      return wd >= ht && ht < altMax && RE_MARCA.test(w.text ?? "");
    });

    let achadas: Assinatura[] = [];
    if (marcas.length >= 3) {
      const bxs = marcas.map((w) => w.bbox as TessBBox);
      const x0 = Math.min(...bxs.map((b) => b.x0));
      const y0 = Math.min(...bxs.map((b) => b.y0));
      const x1 = Math.max(...bxs.map((b) => b.x1));
      const y1 = Math.max(...bxs.map((b) => b.y1));
      const alturas = bxs.map((b) => b.y1 - b.y0).sort((a, b) => a - b);
      const lineH = alturas[Math.floor(alturas.length / 2)] || scale * 4;
      const bw = x1 - x0;
      // Estende p/ CIMA (as 2 linhas "Assinado…/NOME:CPF" acima do ND:) e à DIREITA (linhas completas);
      // NÃO estende à esquerda (lá fica o nome grande sobreposto, que corrompe o OCR).
      const cx = Math.max(0, x0 - 6);
      const cy = Math.max(0, y0 - lineH * 2.6);
      const cw = Math.min(canvas.width - cx, bw * 1.7 + 12);
      const ch = Math.min(canvas.height - cy, y1 - y0 + lineH * 3.2);
      const recorte = recortar(canvas, cx, cy, cw, ch, 2);
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      const r2 = await worker.recognize(recorte);
      achadas = assinaturasFoxitDeTexto(String(r2?.data?.text ?? ""));
    }
    // Fallback: se o recorte não achou, tenta o texto da página inteira do passe 1.
    if (achadas.length === 0) achadas = assinaturasFoxitDeTexto(texto1);
    return achadas;
  } catch {
    return []; // OCR é auxiliar — nunca quebra o import.
  }
}
