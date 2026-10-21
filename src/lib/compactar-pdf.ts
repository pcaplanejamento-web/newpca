import {
  cabe,
  type EtapaCompactacao,
  etapasCompactacao,
  LIMITE_DOCUMENTO_ADM,
  NIVEIS_LEGIVEIS,
  type VersaoTamanho,
  versoesEscolhiveis,
} from "./compactar-pdf-core";

/** O PDF pronto para gravar: os bytes, as páginas e se as páginas viraram imagem. */
export type PdfCompactado = { bytes: Uint8Array; paginas: number; compactado: boolean; original: number };

/** Uma versão para o ADM escolher: o PDF + a prévia da 1ª página (URL de objeto — revogar ao terminar). */
export type VersaoPdf = VersaoTamanho & { bytes: Uint8Array; compactado: boolean; previa: string };

/** A qualidade com que cada página é guardada uma vez na compactação automática. */
const BASE: EtapaCompactacao = { escala: 1.5, qualidade: 0.85 };
/** A base das versões do ADM: o melhor nível oferecido (as demais só reduzem esta imagem). */
const BASE_ADM: EtapaCompactacao = { escala: 2, qualidade: 0.92 };

type PaginaBase = { jpeg: Blob; largura: number; altura: number };

const paraBlob = (c: HTMLCanvasElement, qualidade: number) =>
  new Promise<Blob>((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error("Não consegui gerar a imagem da página."))), "image/jpeg", qualidade));

async function lerFonte(file: File) {
  const original = new Uint8Array(await file.arrayBuffer());
  const { PDFDocument } = await import("pdf-lib");
  try {
    return { original, fonte: await PDFDocument.load(original, { ignoreEncryption: true }) };
  } catch {
    throw new Error("Não consegui ler este PDF.");
  }
}

/** Renderiza cada página UMA vez (pdf.js) e guarda como JPEG — as etapas só reduzem essa imagem. */
async function paginasBase(file: File, base: EtapaCompactacao, aoAvancar?: (t: string) => void): Promise<PaginaBase[]> {
  const { abrirPdf } = await import("./parse-dfd-pdf");
  const doc = await abrirPdf(file);
  const bases: PaginaBase[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      aoAvancar?.(`Lendo a página ${p} de ${doc.numPages}…`);
      const canvas = await doc.renderPagina(p, base.escala);
      bases.push({ jpeg: await paraBlob(canvas, base.qualidade), largura: canvas.width / base.escala, altura: canvas.height / base.escala });
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await doc.destroy();
  }
  return bases;
}

/**
 * Monta o PDF com as páginas em JPEG na etapa pedida. Passou do `limite` no meio → `null` (sem montar o resto). Devolve
 * também a 1ª página da etapa (a prévia).
 */
async function pdfDaEtapa(bases: PaginaBase[], etapa: EtapaCompactacao, limite: number): Promise<{ bytes: Uint8Array; primeira: Blob } | null> {
  const { PDFDocument } = await import("pdf-lib");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("O navegador não permitiu desenhar as páginas.");
  const novo = await PDFDocument.create();
  let total = 0;
  let primeira: Blob | null = null;
  for (const b of bases) {
    const img = await createImageBitmap(b.jpeg);
    canvas.width = Math.max(1, Math.round(b.largura * etapa.escala));
    canvas.height = Math.max(1, Math.round(b.altura * etapa.escala));
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.close();
    const blob = await paraBlob(canvas, etapa.qualidade);
    primeira ??= blob;
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    total += jpeg.length;
    if (total > limite) return null;
    novo.addPage([b.largura, b.altura]).drawImage(await novo.embedJpg(jpeg), { x: 0, y: 0, width: b.largura, height: b.altura });
  }
  const bytes = await novo.save({ useObjectStreams: true });
  return bytes.length <= limite && primeira ? { bytes, primeira } : null;
}

/**
 * Deixa o PDF com até 100 KB (só no navegador; pdf.js e pdf-lib carregados aqui). 1) já cabe → como veio; 2) regravado
 * pelo pdf-lib (fluxos de objetos); 3) cada página vira uma imagem JPEG, descendo a escada (escala × qualidade) até caber.
 */
export async function compactarPdf(file: File, aoAvancar?: (texto: string) => void): Promise<PdfCompactado> {
  const { original, fonte } = await lerFonte(file);
  const paginas = fonte.getPageCount();
  if (cabe(original.length)) return { bytes: original, paginas, compactado: false, original: original.length };

  aoAvancar?.("Otimizando o PDF…");
  const regravado = await fonte.save({ useObjectStreams: true });
  if (cabe(regravado.length)) return { bytes: regravado, paginas, compactado: false, original: original.length };

  const bases = await paginasBase(file, BASE, aoAvancar);
  for (const [i, etapa] of etapasCompactacao().entries()) {
    aoAvancar?.(`Compactando (tentativa ${i + 1})…`);
    const r = await pdfDaEtapa(bases, etapa, 100 * 1024);
    if (r) return { bytes: r.bytes, paginas, compactado: true, original: original.length };
  }
  throw new Error("Não foi possível compactar este PDF.");
}

/**
 * As VERSÕES que o ADM escolhe na barra: do original (o máximo) ao MÍNIMO LEGÍVEL (`NIVEIS_LEGIVEIS`), cada uma com o
 * tamanho real e a prévia da 1ª página — até 1 MB. Nenhuma cabe em 1 MB → vazio (quem chama usa a automática).
 */
export async function versoesParaEscolha(file: File, aoAvancar?: (texto: string) => void): Promise<{ paginas: number; original: number; versoes: VersaoPdf[] }> {
  const { original, fonte } = await lerFonte(file);
  const paginas = fonte.getPageCount();
  const bases = await paginasBase(file, BASE_ADM, aoAvancar);
  const previaOriginal = URL.createObjectURL(bases[0]?.jpeg ?? new Blob());
  const versoes: VersaoPdf[] = [{ bytes: original, tamanho: original.length, rotulo: "Original", compactado: false, previa: previaOriginal }];
  aoAvancar?.("Otimizando o PDF…");
  const regravado = await fonte.save({ useObjectStreams: true });
  versoes.push({ bytes: regravado, tamanho: regravado.length, rotulo: "Otimizado (sem perder qualidade)", compactado: false, previa: previaOriginal });
  for (const [i, etapa] of NIVEIS_LEGIVEIS.entries()) {
    aoAvancar?.(`Preparando o nível ${i + 1} de ${NIVEIS_LEGIVEIS.length}…`);
    const r = await pdfDaEtapa(bases, etapa, LIMITE_DOCUMENTO_ADM);
    if (r) {
      const ultimo = i === NIVEIS_LEGIVEIS.length - 1;
      versoes.push({ bytes: r.bytes, tamanho: r.bytes.length, rotulo: ultimo ? "Mínimo legível" : `Imagem nível ${i + 1}`, compactado: true, previa: URL.createObjectURL(r.primeira) });
    }
  }
  const escolhiveis = versoesEscolhiveis(versoes);
  for (const v of versoes) if (!escolhiveis.includes(v) && v.previa !== previaOriginal) URL.revokeObjectURL(v.previa);
  if (!escolhiveis.some((v) => v.previa === previaOriginal)) URL.revokeObjectURL(previaOriginal);
  return { paginas, original: original.length, versoes: escolhiveis };
}
