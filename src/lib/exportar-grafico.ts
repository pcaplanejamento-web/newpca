/**
 * PNG de um gráfico do Dashboard (o botão "PNG" do explorador): barras horizontais desenhadas num <canvas> a partir dos
 * MESMOS números da tela — título, o recorte (filtros), cada linha com o rótulo, a barra na cor da série, o valor e a
 * participação, e o rodapé com a data. O LAYOUT é puro (testado); o desenho usa só a API do canvas (sem biblioteca).
 */

export type LinhaPng = { rotulo: string; valor: number; texto: string; participacao: string; cor: string };

export type EntradaPng = { titulo: string; subtitulo?: string; linhas: LinhaPng[]; rodape?: string };

export const LARGURA_PNG = 1200;
const MARGEM = 48;
const ALTURA_LINHA = 34;
const TOPO = 120;
const ROTULO = 360;
const VALOR = 230;
/** Mais que isto não cabe numa imagem legível — o resto vira "e mais N". */
export const MAX_LINHAS_PNG = 40;

export type LayoutPng = {
  largura: number;
  altura: number;
  barras: { y: number; x: number; largura: number; altura: number; linha: LinhaPng }[];
  mais: number;
};

/** Onde cada barra fica (escala pela maior). */
export function layoutPng(e: EntradaPng, largura = LARGURA_PNG): LayoutPng {
  const linhas = e.linhas.slice(0, MAX_LINHAS_PNG);
  const maior = Math.max(0, ...linhas.map((l) => l.valor));
  const areaBarra = largura - MARGEM * 2 - ROTULO - VALOR;
  const barras = linhas.map((linha, i) => ({
    y: TOPO + i * ALTURA_LINHA,
    x: MARGEM + ROTULO,
    largura: maior > 0 ? Math.max(linha.valor > 0 ? 2 : 0, (Math.max(0, linha.valor) / maior) * areaBarra) : 0,
    altura: 18,
    linha,
  }));
  const mais = e.linhas.length - linhas.length;
  const altura = TOPO + linhas.length * ALTURA_LINHA + (mais > 0 ? ALTURA_LINHA : 0) + 64;
  return { largura, altura, barras, mais };
}

/** Corta o texto à largura (com "…"). */
function cortar(ctx: CanvasRenderingContext2D, t: string, max: number): string {
  if (ctx.measureText(t).width <= max) return t;
  let s = t;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/** Desenha e baixa o PNG (navegador). As cores da série vêm já RESOLVIDAS (sem var()). */
export async function baixarPngGrafico(e: EntradaPng, nomeArquivo: string, cores: { texto: string; muted: string; fundo: string; trilho: string }) {
  const l = layoutPng(e);
  const escala = 2;
  const canvas = document.createElement("canvas");
  canvas.width = l.largura * escala;
  canvas.height = l.altura * escala;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("O navegador não desenhou a imagem.");
  ctx.scale(escala, escala);
  ctx.fillStyle = cores.fundo;
  ctx.fillRect(0, 0, l.largura, l.altura);
  const fonte = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillStyle = cores.texto;
  ctx.font = `700 24px ${fonte}`;
  ctx.fillText(cortar(ctx, e.titulo, l.largura - MARGEM * 2), MARGEM, 52);
  if (e.subtitulo) {
    ctx.fillStyle = cores.muted;
    ctx.font = `400 15px ${fonte}`;
    ctx.fillText(cortar(ctx, e.subtitulo, l.largura - MARGEM * 2), MARGEM, 84);
  }
  for (const b of l.barras) {
    const meio = b.y + b.altura / 2;
    ctx.fillStyle = cores.texto;
    ctx.font = `400 14px ${fonte}`;
    ctx.textAlign = "left";
    ctx.fillText(cortar(ctx, b.linha.rotulo, ROTULO - 16), MARGEM, meio);
    ctx.fillStyle = cores.trilho;
    ctx.fillRect(b.x, b.y, l.largura - MARGEM * 2 - ROTULO - VALOR, b.altura);
    ctx.fillStyle = b.linha.cor;
    ctx.fillRect(b.x, b.y, b.largura, b.altura);
    ctx.textAlign = "right";
    ctx.fillStyle = cores.texto;
    ctx.font = `600 14px ${fonte}`;
    ctx.fillText(b.linha.texto, l.largura - MARGEM - 64, meio);
    ctx.fillStyle = cores.muted;
    ctx.font = `400 13px ${fonte}`;
    ctx.fillText(b.linha.participacao, l.largura - MARGEM, meio);
  }
  ctx.textAlign = "left";
  ctx.fillStyle = cores.muted;
  ctx.font = `400 13px ${fonte}`;
  const fim = TOPO + l.barras.length * ALTURA_LINHA;
  if (l.mais > 0) ctx.fillText(`e mais ${l.mais}`, MARGEM, fim + ALTURA_LINHA / 2);
  if (e.rodape) ctx.fillText(e.rodape, MARGEM, l.altura - 28);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
  if (!blob) throw new Error("O navegador não gerou a imagem.");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
