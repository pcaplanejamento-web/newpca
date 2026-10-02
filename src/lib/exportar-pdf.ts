import { baixarNoNavegador, comoBlob } from "./arquivo-navegador";
import {
  colunasDaTabela,
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
 * larga demais sai em FAIXAS de colunas (as `fixas` primeiras repetidas em cada uma). Cores fixas em cinza: o PDF é um
 * documento de saída (papel), não segue o tema.
 */
export async function baixarTabelaPdf(
  arquivo: string,
  tabela: TabelaPdf,
  opcoes: { fixas?: number; sistema?: string; usuario?: string | null } = {},
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
  };
  const medir = (texto: string, tam: number, b?: boolean) => (b ? negrito : fonte).widthOfTextAtSize(texto, tam);
  const faixas = faixasDeColunas(t, opcoes.fixas ?? 1, medir);
  const layouts: { layout: LayoutPdf; tabela: TabelaPdf; rotulo: string }[] = faixas.map((cols, i) => {
    const parte = colunasDaTabela(t, cols);
    const rotulo = faixas.length > 1 ? `Parte ${i + 1} de ${faixas.length} das colunas` : "";
    return { layout: montarLayoutPdf(parte, medir), tabela: parte, rotulo };
  });
  const { largura: W, altura: H, margem: M } = PAGINA_PDF;
  const cinza = (v: number) => rgb(v, v, v);
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
      if (l.cabecalho || zebra) pag.drawRectangle({ x: M, y: y - l.altura, width: larguraTotal, height: l.altura, color: cinza(l.cabecalho ? 0.92 : 0.975) });
      let x = M;
      layout.larguras.forEach((w, j) => {
        const f = l.cabecalho ? negrito : fonte;
        const al = l.cabecalho ? "left" : (parte.alinhar?.[j] ?? "left");
        l.celulas[j]?.forEach((texto, k) => {
          if (!texto) return;
          const tw = f.widthOfTextAtSize(texto, tam);
          const tx = al === "right" ? x + w - PAD_H - tw : al === "center" ? x + (w - tw) / 2 : x + PAD_H;
          pag.drawText(texto, { x: tx, y: y - PAD_V - k * lh - tam * 0.95, size: tam, font: f, color: cinza(0.1) });
        });
        x += w;
      });
      pag.drawLine({ start: { x: M, y: y - l.altura }, end: { x: M + larguraTotal, y: y - l.altura }, thickness: 0.4, color: cinza(0.78) });
    };
    for (const p of layout.paginas) {
      numero++;
      const pag = doc.addPage([W, H]);
      // Topo: o título (e o subtítulo + a parte das colunas) — em todas as páginas: a folha avulsa diz de onde veio.
      pag.drawText(t.titulo, { x: M, y: H - M - 11, size: 11, font: negrito, color: cinza(0.05), maxWidth: W - 2 * M });
      const sub = [t.subtitulo, rotulo].filter(Boolean).join(" · ");
      if (sub) pag.drawText(sub, { x: M, y: H - M - 24, size: 7.5, font: fonte, color: cinza(0.4), maxWidth: W - 2 * M });
      const topo = H - M - TOPO_PDF;
      let y = topo;
      pag.drawLine({ start: { x: M, y }, end: { x: M + larguraTotal, y }, thickness: 0.4, color: cinza(0.78) });
      desenharLinha(pag, layout.cabecalho, y, false);
      y -= layout.cabecalho.altura;
      p.linhas.forEach((l, k) => {
        desenharLinha(pag, l, y, k % 2 === 1);
        y -= l.altura;
      });
      // Divisórias verticais (do topo do cabeçalho até a última linha).
      let x = M;
      for (let j = 0; j <= layout.larguras.length; j++) {
        pag.drawLine({ start: { x, y: topo }, end: { x, y }, thickness: 0.4, color: cinza(0.78) });
        x += layout.larguras[j] ?? 0;
      }
      pag.drawText(rodape, { x: M, y: M - 4, size: 7, font: fonte, color: cinza(0.45), maxWidth: W - 2 * M - 80 });
      const pg = `Página ${numero} de ${total}`;
      pag.drawText(pg, { x: W - M - fonte.widthOfTextAtSize(pg, 7), y: M - 4, size: 7, font: fonte, color: cinza(0.45) });
    }
  }
  doc.setTitle(t.titulo);
  doc.setCreator(sistema);
  baixarNoNavegador(arquivo, comoBlob(await doc.save()));
}
