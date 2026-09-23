/**
 * Matemática do RECORTE da capa do PCA (proporção fixa, padrão 4:5) — PURO (sem DOM → testável).
 * A imagem é mostrada numa moldura; o usuário aplica ZOOM (≥ 1 = a imagem cobre a moldura) e
 * ARRASTA. Daqui sai o retângulo de ORIGEM (em pixels da imagem) a desenhar no canvas final.
 */

export const PROPORCAO_CAPA = 4 / 5; // largura ÷ altura
export const CAPA_LARGURA = 800;
export const CAPA_ALTURA = 1000;
export const ZOOM_MAX = 4;

export type Recorte = { zoom: number; /** deslocamento do centro, em fração da sobra (-1..1). */ dx: number; dy: number };

export const RECORTE_INICIAL: Recorte = { zoom: 1, dx: 0, dy: 0 };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Tamanho (px da imagem) do retângulo visível com zoom 1 — o maior retângulo na proporção que cabe. */
export function baseVisivel(largura: number, altura: number, proporcao = PROPORCAO_CAPA): { w: number; h: number } {
  if (largura <= 0 || altura <= 0) return { w: 0, h: 0 };
  return largura / altura > proporcao ? { w: altura * proporcao, h: altura } : { w: largura, h: largura / proporcao };
}

/** Normaliza o recorte (zoom 1..ZOOM_MAX; deslocamentos -1..1). */
export function normalizarRecorte(r: Recorte): Recorte {
  return {
    zoom: clamp(Number.isFinite(r.zoom) ? r.zoom : 1, 1, ZOOM_MAX),
    dx: clamp(Number.isFinite(r.dx) ? r.dx : 0, -1, 1),
    dy: clamp(Number.isFinite(r.dy) ? r.dy : 0, -1, 1),
  };
}

/** Retângulo de ORIGEM `{sx,sy,sw,sh}` (px da imagem) — sempre DENTRO da imagem. */
export function retanguloOrigem(largura: number, altura: number, recorte: Recorte, proporcao = PROPORCAO_CAPA) {
  const r = normalizarRecorte(recorte);
  const base = baseVisivel(largura, altura, proporcao);
  const sw = base.w / r.zoom;
  const sh = base.h / r.zoom;
  const sobraX = (largura - sw) / 2;
  const sobraY = (altura - sh) / 2;
  return { sx: sobraX + r.dx * sobraX, sy: sobraY + r.dy * sobraY, sw, sh };
}

/**
 * Converte um ARRASTO (px na tela, na moldura de `larguraMoldura`) em novo recorte: arrastar para a
 * direita mostra mais da ESQUERDA da imagem (o conteúdo acompanha o dedo).
 */
export function arrastar(
  recorte: Recorte,
  deltaTelaX: number,
  deltaTelaY: number,
  larguraMoldura: number,
  largura: number,
  altura: number,
  proporcao = PROPORCAO_CAPA,
): Recorte {
  const r = normalizarRecorte(recorte);
  const { sw, sh } = retanguloOrigem(largura, altura, r, proporcao);
  if (larguraMoldura <= 0) return r;
  const escala = sw / larguraMoldura; // px da imagem por px da tela
  const sobraX = (largura - sw) / 2;
  const sobraY = (altura - sh) / 2;
  const dx = sobraX > 0 ? r.dx - (deltaTelaX * escala) / sobraX : 0;
  const dy = sobraY > 0 ? r.dy - (deltaTelaY * escala) / sobraY : 0;
  return normalizarRecorte({ zoom: r.zoom, dx, dy });
}
