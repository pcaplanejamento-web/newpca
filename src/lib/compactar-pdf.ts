import { cabe, type EtapaCompactacao, etapasCompactacao } from "./compactar-pdf-core";

/** O PDF pronto para gravar: os bytes (≤ 100 KB), as páginas e se as páginas viraram imagem. */
export type PdfCompactado = { bytes: Uint8Array; paginas: number; compactado: boolean; original: number };

/** A qualidade com que cada página é guardada uma vez (a base das etapas — nunca se renderiza o PDF de novo). */
const BASE: EtapaCompactacao = { escala: 1.5, qualidade: 0.85 };

const paraBlob = (c: HTMLCanvasElement, qualidade: number) =>
  new Promise<Blob>((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error("Não consegui gerar a imagem da página."))), "image/jpeg", qualidade));

/**
 * Deixa o PDF com até 100 KB (só no navegador; pdf.js e pdf-lib carregados aqui). 1) já cabe → como veio; 2) regravado
 * pelo pdf-lib (fluxos de objetos); 3) cada página vira uma imagem JPEG, descendo a escada (escala × qualidade) até
 * caber. As páginas são renderizadas UMA vez e guardadas como JPEG — cada etapa só reduz essa imagem.
 */
export async function compactarPdf(file: File, aoAvancar?: (texto: string) => void): Promise<PdfCompactado> {
  const original = new Uint8Array(await file.arrayBuffer());
  const { PDFDocument } = await import("pdf-lib");
  let fonte: import("pdf-lib").PDFDocument;
  try {
    fonte = await PDFDocument.load(original, { ignoreEncryption: true });
  } catch {
    throw new Error("Não consegui ler este PDF.");
  }
  const paginas = fonte.getPageCount();
  if (cabe(original.length)) return { bytes: original, paginas, compactado: false, original: original.length };

  aoAvancar?.("Otimizando o PDF…");
  const regravado = await fonte.save({ useObjectStreams: true });
  if (cabe(regravado.length)) return { bytes: regravado, paginas, compactado: false, original: original.length };

  const { abrirPdf } = await import("./parse-dfd-pdf");
  const doc = await abrirPdf(file);
  const bases: { jpeg: Blob; largura: number; altura: number }[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      aoAvancar?.(`Lendo a página ${p} de ${doc.numPages}…`);
      const canvas = await doc.renderPagina(p, BASE.escala);
      bases.push({ jpeg: await paraBlob(canvas, BASE.qualidade), largura: canvas.width / BASE.escala, altura: canvas.height / BASE.escala });
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await doc.destroy();
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("O navegador não permitiu desenhar as páginas.");
  for (const [i, etapa] of etapasCompactacao().entries()) {
    aoAvancar?.(`Compactando (tentativa ${i + 1})…`);
    const novo = await PDFDocument.create();
    let total = 0;
    for (const b of bases) {
      const img = await createImageBitmap(b.jpeg);
      canvas.width = Math.max(1, Math.round(b.largura * etapa.escala));
      canvas.height = Math.max(1, Math.round(b.altura * etapa.escala));
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.close();
      const jpeg = new Uint8Array(await (await paraBlob(canvas, etapa.qualidade)).arrayBuffer());
      total += jpeg.length;
      const imagem = await novo.embedJpg(jpeg);
      novo.addPage([b.largura, b.altura]).drawImage(imagem, { x: 0, y: 0, width: b.largura, height: b.altura });
      // As imagens já passaram do limite: a etapa seguinte, sem montar o resto.
      if (!cabe(total)) break;
    }
    if (!cabe(total)) continue;
    const pronto = await novo.save({ useObjectStreams: true });
    if (cabe(pronto.length)) return { bytes: pronto, paginas, compactado: true, original: original.length };
  }
  throw new Error("Não foi possível compactar este PDF.");
}
