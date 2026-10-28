import { type BlocoDoc, limparBlocos, montarDocumento, PAGINA_A4 } from "./documento-pdf-core.ts";
import { corRgb, PALETA_PADRAO, type PaletaPdf, textoParaPdf } from "./exportar-pdf-core.ts";

export type OpcoesGerar = {
  /** O rodapé completo (sem o "Página N de M"). */
  rodape: string;
  sistema: string;
  paleta?: PaletaPdf;
  carimbo?: { titulo: string; linhas: string[]; cor: string };
  /** O TIMBRE (PNG) no alto de cada página, na largura da folha. */
  timbre?: { png: Uint8Array; largura: number; altura: number };
  /** Margem lateral (pt) — sem ela, a do A4 padrão. */
  margem?: number;
  /** Data FIXA dos metadados (criação/modificação): com ela, o MESMO documento gera os MESMOS bytes. */
  data?: Date;
  assunto?: string;
  palavras?: string[];
};

/**
 * Desenha um DOCUMENTO (os blocos do `documento-pdf-core`) com o pdf-lib e devolve os BYTES — sem DOM: roda no navegador e
 * no Worker. Com `data`, a saída é DETERMINÍSTICA (nada depende da hora em que foi gerado).
 */
export async function gerarDocumentoPdf(doc: { titulo: string; blocos: BlocoDoc[] }, o: OpcoesGerar): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const conjunto = new Set(fonte.getCharacterSet());
  const limpo = (s: string) => textoParaPdf(s, (cp) => conjunto.has(cp));
  const paleta = o.paleta ?? PALETA_PADRAO;
  const cor = (css: string) => {
    const papel = css.startsWith("@") ? (paleta[css.slice(1) as keyof Omit<PaletaPdf, "tokens">] ?? paleta.texto) : css;
    const [r, g, b] = corRgb(papel, paleta) ?? corRgb(paleta.texto, paleta) ?? [0, 0, 0];
    return rgb(r, g, b);
  };
  const medir = (texto: string, tam: number, b?: boolean) => (b ? negrito : fonte).widthOfTextAtSize(texto, tam);
  const carimbo = o.carimbo ? { titulo: limpo(o.carimbo.titulo), linhas: o.carimbo.linhas.map(limpo), cor: o.carimbo.cor } : undefined;
  const paginas = montarDocumento(limparBlocos(doc.blocos, limpo), medir, {
    titulo: limpo(doc.titulo),
    rodape: limpo(o.rodape),
    carimbo,
    timbre: o.timbre && { largura: o.timbre.largura, altura: o.timbre.altura },
    margem: o.margem,
  });
  const timbre = o.timbre ? await pdf.embedPng(o.timbre.png) : null;
  const { largura: W, altura: H } = PAGINA_A4;
  for (const ops of paginas) {
    const pag = pdf.addPage([W, H]);
    for (const op of ops) {
      if (op.t === "texto") pag.drawText(op.texto, { x: op.x, y: H - op.y, size: op.tam, font: op.negrito ? negrito : fonte, color: cor(op.cor) });
      else if (op.t === "timbre") {
        if (timbre) pag.drawImage(timbre, { x: op.x, y: H - op.y - op.h, width: op.w, height: op.h });
      } else if (op.t === "retangulo") pag.drawRectangle({ x: op.x, y: H - op.y - op.h, width: op.w, height: op.h, color: cor(op.cor) });
      else pag.drawLine({ start: { x: op.x1, y: H - op.y1 }, end: { x: op.x2, y: H - op.y2 }, thickness: op.espessura, color: cor(op.cor) });
    }
  }
  pdf.setTitle(limpo(doc.titulo));
  pdf.setCreator(o.sistema);
  pdf.setProducer(o.sistema);
  if (o.assunto) pdf.setSubject(limpo(o.assunto));
  if (o.palavras?.length) pdf.setKeywords(o.palavras.map(limpo));
  const data = o.data ?? new Date();
  pdf.setCreationDate(data);
  pdf.setModificationDate(data);
  return pdf.save();
}
