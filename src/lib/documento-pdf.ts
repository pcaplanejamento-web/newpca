import { baixarNoNavegador, comoBlob } from "./arquivo-navegador";
import { type BlocoDoc, limparBlocos, montarDocumento, PAGINA_A4 } from "./documento-pdf-core";
import { corRgb, type PaletaPdf, textoParaPdf } from "./exportar-pdf-core";
import { paletaDoDocumento } from "./exportar-pdf";

/**
 * Gera e BAIXA um DOCUMENTO em PDF (A4 em pé) a partir de BLOCOS (navegador; o pdf-lib é carregado só aqui). O layout é
 * do núcleo puro `documento-pdf-core` — aqui só se desenham as operações, nas cores do design system (tema claro: o
 * papel), com o rodapé "Gerado por <quem> em dd/mm/aaaa às hh:mm (horário de Brasília) · <sistema> · Página N de M".
 */
export async function baixarDocumentoPdf(
  arquivo: string,
  doc: { titulo: string; blocos: BlocoDoc[] },
  opcoes: { usuario?: string | null; sistema?: string; paleta?: PaletaPdf } = {},
): Promise<void> {
  const sistema = opcoes.sistema ?? "Plataforma PCA";
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const conjunto = new Set(fonte.getCharacterSet());
  const limpo = (s: string) => textoParaPdf(s, (cp) => conjunto.has(cp));
  const paleta = opcoes.paleta ?? paletaDoDocumento();
  const cor = (css: string) => {
    const papel = css.startsWith("@") ? (paleta[css.slice(1) as keyof Omit<PaletaPdf, "tokens">] ?? paleta.texto) : css;
    const [r, g, b] = corRgb(papel, paleta) ?? corRgb(paleta.texto, paleta) ?? [0, 0, 0];
    return rgb(r, g, b);
  };
  const agora = new Date();
  const fuso = { timeZone: "America/Sao_Paulo" } as const;
  const quando = `${agora.toLocaleDateString("pt-BR", fuso)} às ${agora.toLocaleTimeString("pt-BR", { ...fuso, hour: "2-digit", minute: "2-digit" })}`;
  const rodape = limpo(`Gerado ${opcoes.usuario ? `por ${opcoes.usuario} ` : ""}em ${quando} (horário de Brasília) · ${sistema}`);
  const medir = (texto: string, tam: number, b?: boolean) => (b ? negrito : fonte).widthOfTextAtSize(texto, tam);
  const paginas = montarDocumento(limparBlocos(doc.blocos, limpo), medir, { titulo: limpo(doc.titulo), rodape });
  const { largura: W, altura: H } = PAGINA_A4;
  for (const ops of paginas) {
    const pag = pdf.addPage([W, H]);
    for (const o of ops) {
      if (o.t === "texto") pag.drawText(o.texto, { x: o.x, y: H - o.y, size: o.tam, font: o.negrito ? negrito : fonte, color: cor(o.cor) });
      else if (o.t === "retangulo") pag.drawRectangle({ x: o.x, y: H - o.y - o.h, width: o.w, height: o.h, color: cor(o.cor) });
      else pag.drawLine({ start: { x: o.x1, y: H - o.y1 }, end: { x: o.x2, y: H - o.y2 }, thickness: o.espessura, color: cor(o.cor) });
    }
  }
  pdf.setTitle(limpo(doc.titulo));
  pdf.setCreator(sistema);
  baixarNoNavegador(arquivo, comoBlob(await pdf.save()));
}
