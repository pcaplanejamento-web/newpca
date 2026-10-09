import { baixarNoNavegador, comoBlob } from "./arquivo-navegador";
import {
  colunasDaTabela,
  corRgb,
  PALETA_PADRAO,
  type PaletaPdf,
  entrelinha,
  faixasDeColunas,
  type LayoutPdf,
  type LinhaLayout,
  montarLayoutPdf,
  PAD_H,
  PAD_V,
  PAGINA_PDF,
  type TabelaPdf,
  TOPO_PDF,
  textoParaPdf,
} from "./exportar-pdf-core";

/**
 * Gera e BAIXA o PDF de uma tabela (navegador; o pdf-lib é carregado só aqui). O layout vem do núcleo puro
 * (`faixasDeColunas` + `montarLayoutPdf`); aqui só se desenha: título no topo de cada página, o cabeçalho das colunas
 * repetido, as linhas com zebra e bordas finas, números à direita, e o rodapé "Baixado por <quem> em dd/mm/aaaa às hh:mm
 * (horário de Brasília) · Página N de M". Tabela
 * larga demais sai em FAIXAS de colunas (as `fixas` primeiras repetidas em cada uma). COLORIDO como as tabelas do
 * sistema: as cores do design system no tema CLARO (o papel) — `paletaDoDocumento` (as do ADM quando a tela está
 * clara) —, cabeçalho no tom de destaque, zebra, e o texto de cada célula na cor que a tela dá (`TabelaPdf.cores`).
 */

/** A paleta do PDF a partir dos TOKENS da tela (a cor de destaque do ADM, por exemplo) — só com o tema CLARO à vista; no
 * escuro (ou sem documento), o tema claro padrão: o papel é claro. */
export function paletaDoDocumento(): PaletaPdf {
  if (typeof document === "undefined" || document.documentElement.dataset.theme === "dark") return PALETA_PADRAO;
  const css = getComputedStyle(document.documentElement);
  const v = (nome: string, padrao: string) => {
    const x = css.getPropertyValue(`--${nome}`).trim();
    return corRgb(x) ? x : padrao;
  };
  const tokens = Object.fromEntries(Object.entries(PALETA_PADRAO.tokens).map(([k, p]) => [k, v(k, p)]));
  const accent = v("accent", PALETA_PADRAO.titulo);
  const soft = v("accent-soft", PALETA_PADRAO.cabecalhoFundo);
  return {
    texto: v("text", PALETA_PADRAO.texto),
    muted: v("muted", PALETA_PADRAO.muted),
    titulo: accent,
    cabecalhoFundo: soft,
    cabecalhoTexto: accent,
    zebra: v("surface-2", PALETA_PADRAO.zebra),
    borda: v("border-2", PALETA_PADRAO.borda),
    destaque: soft,
    tokens,
  };
}
export async function baixarTabelaPdf(
  arquivo: string,
  tabela: TabelaPdf,
  opcoes: { fixas?: number; sistema?: string; usuario?: string | null; paleta?: PaletaPdf } = {},
): Promise<void> {
  const sistema = opcoes.sistema ?? "Plataforma PCA";
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const conjunto = new Set(fonte.getCharacterSet());
  const limpo = (s: string) => textoParaPdf(s, (cp) => conjunto.has(cp));
  const t: TabelaPdf = {
    titulo: limpo(tabela.titulo),
    subtitulo: tabela.subtitulo ? limpo(tabela.subtitulo) : undefined,
    cabecalho: tabela.cabecalho.map(limpo),
    linhas: tabela.linhas.map((l) => l.map(limpo)),
    alinhar: tabela.alinhar,
    cores: tabela.cores,
    destaques: tabela.destaques,
  };
  const paleta = opcoes.paleta ?? paletaDoDocumento();
  const cor = (css: string, padrao: string) => {
    const [r, g, b] = corRgb(css, paleta) ?? corRgb(padrao, paleta) ?? [0, 0, 0];
    return rgb(r, g, b);
  };
  const destacadas = new Set(t.destaques ?? []);
  const medir = (texto: string, tam: number, b?: boolean) => (b ? negrito : fonte).widthOfTextAtSize(texto, tam);
  const faixas = faixasDeColunas(t, opcoes.fixas ?? 1, medir);
  const layouts: { layout: LayoutPdf; tabela: TabelaPdf; rotulo: string }[] = faixas.map((cols, i) => {
    const parte = colunasDaTabela(t, cols);
    const rotulo = faixas.length > 1 ? `Parte ${i + 1} de ${faixas.length} das colunas` : "";
    return { layout: montarLayoutPdf(parte, medir), tabela: parte, rotulo };
  });
  const { largura: W, altura: H, margem: M } = PAGINA_PDF;
  const agora = new Date();
  const fuso = { timeZone: "America/Sao_Paulo" } as const;
  const quando = `${agora.toLocaleDateString("pt-BR", fuso)} às ${agora.toLocaleTimeString("pt-BR", { ...fuso, hour: "2-digit", minute: "2-digit" })}`;
  const rodape = limpo(`Baixado ${opcoes.usuario ? `por ${opcoes.usuario} ` : ""}em ${quando} (horário de Brasília) · ${sistema}`);
  const total = layouts.reduce((s, l) => s + l.layout.paginas.length, 0);
  let numero = 0;

  for (const { layout, tabela: parte, rotulo } of layouts) {
    const tam = layout.tamanho;
    const lh = entrelinha(tam);
    const larguraTotal = layout.larguras.reduce((s, w) => s + w, 0);
    const desenharLinha = (pag: import("pdf-lib").PDFPage, l: LinhaLayout, y: number, zebra: boolean) => {
      const realce = l.origem != null && destacadas.has(l.origem);
      const fundo = l.cabecalho ? paleta.cabecalhoFundo : realce ? paleta.destaque : zebra ? paleta.zebra : null;
      if (fundo) pag.drawRectangle({ x: M, y: y - l.altura, width: larguraTotal, height: l.altura, color: cor(fundo, "#ffffff") });
      let x = M;
      layout.larguras.forEach((w, j) => {
        const f = l.cabecalho || realce ? negrito : fonte;
        const al = l.cabecalho ? "left" : (parte.alinhar?.[j] ?? "left");
        const tinta = l.cabecalho ? paleta.cabecalhoTexto : ((l.origem != null ? parte.cores?.[l.origem]?.[j] : null) ?? paleta.texto);
        l.celulas[j]?.forEach((texto, k) => {
          if (!texto) return;
          const tw = f.widthOfTextAtSize(texto, tam);
          const tx = al === "right" ? x + w - PAD_H - tw : al === "center" ? x + (w - tw) / 2 : x + PAD_H;
          pag.drawText(texto, { x: tx, y: y - PAD_V - k * lh - tam * 0.95, size: tam, font: f, color: cor(tinta, paleta.texto) });
        });
        x += w;
      });
      pag.drawLine({ start: { x: M, y: y - l.altura }, end: { x: M + larguraTotal, y: y - l.altura }, thickness: 0.4, color: cor(paleta.borda, "#dee2e8") });
    };
    for (const p of layout.paginas) {
      numero++;
      const pag = doc.addPage([W, H]);
      // Topo: o título (e o subtítulo + a parte das colunas) — em todas as páginas: a folha avulsa diz de onde veio.
      pag.drawText(t.titulo, { x: M, y: H - M - 11, size: 11, font: negrito, color: cor(paleta.titulo, paleta.texto), maxWidth: W - 2 * M });
      const sub = [t.subtitulo, rotulo].filter(Boolean).join(" · ");
      if (sub) pag.drawText(sub, { x: M, y: H - M - 24, size: 7.5, font: fonte, color: cor(paleta.muted, paleta.texto), maxWidth: W - 2 * M });
      const topo = H - M - TOPO_PDF;
      let y = topo;
      pag.drawLine({ start: { x: M, y }, end: { x: M + larguraTotal, y }, thickness: 0.4, color: cor(paleta.borda, "#dee2e8") });
      desenharLinha(pag, layout.cabecalho, y, false);
      y -= layout.cabecalho.altura;
      p.linhas.forEach((l, k) => {
        desenharLinha(pag, l, y, k % 2 === 1);
        y -= l.altura;
      });
      // Divisórias verticais (do topo do cabeçalho até a última linha).
      let x = M;
      for (let j = 0; j <= layout.larguras.length; j++) {
        pag.drawLine({ start: { x, y: topo }, end: { x, y }, thickness: 0.4, color: cor(paleta.borda, "#dee2e8") });
        x += layout.larguras[j] ?? 0;
      }
      pag.drawText(rodape, { x: M, y: M - 4, size: 7, font: fonte, color: cor(paleta.muted, paleta.texto), maxWidth: W - 2 * M - 80 });
      const pg = `Página ${numero} de ${total}`;
      pag.drawText(pg, { x: W - M - fonte.widthOfTextAtSize(pg, 7), y: M - 4, size: 7, font: fonte, color: cor(paleta.muted, paleta.texto) });
    }
  }
  doc.setTitle(t.titulo);
  doc.setCreator(sistema);
  baixarNoNavegador(arquivo, comoBlob(await doc.save()));
}
