import { urlAgendaValida } from "./ics-core.ts";

/**
 * IMAGEM DE FUNDO do quadro por LINK (puro — sem banco nem rede): nada é enviado ao servidor, a imagem fica no site de
 * origem. Aceita o link DIRETO da imagem (ex.: `i.pinimg.com/…jpg`) ou o de uma PÁGINA (um pin do Pinterest), da qual o
 * servidor tira a imagem de capa (`og:image`/`twitter:image`).
 */

export const MAX_URL_FUNDO = 1000;

/** O link público HTTPS (fora da rede interna) — `null` = inválido. */
export function fundoUrlValida(bruta: string): string | null {
  const s = bruta.trim();
  if (s.length > MAX_URL_FUNDO) return null;
  // `webcal:` é das agendas — aqui não vale.
  return /^webcals?:/i.test(s) ? null : urlAgendaValida(s);
}

/** O link já é de uma IMAGEM (extensão de imagem ou o servidor de imagens do Pinterest). */
export function pareceImagem(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "i.pinimg.com" || /\.(jpe?g|png|webp|gif|avif|bmp|svg)$/i.test(u.pathname);
  } catch {
    return false;
  }
}

const decodificar = (s: string) =>
  s
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

/** A imagem de CAPA de uma página (`og:image`, `og:image:secure_url`, `twitter:image`), resolvida contra `base`. */
export function imagemDaPagina(html: string, base: string): string | null {
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  const achadas = new Map<string, string>();
  for (const m of metas) {
    const attr = (n: string) => new RegExp(`\\b${n}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(m);
    const chave = attr("property") ?? attr("name");
    const valor = attr("content");
    if (!chave || !valor) continue;
    const k = (chave[1] ?? chave[2] ?? chave[3] ?? "").toLowerCase();
    if (!achadas.has(k)) achadas.set(k, decodificar(valor[1] ?? valor[2] ?? valor[3] ?? "").trim());
  }
  for (const k of ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"]) {
    const v = achadas.get(k);
    if (!v) continue;
    try {
      const u = fundoUrlValida(new URL(v, base).toString());
      if (u) return u;
    } catch {}
  }
  return null;
}

/** O valor CSS `url("…")` de um link já validado (aspas, parênteses e barras invertidas codificados). */
export const urlFundoCss = (url: string) => `url("${url.replace(/["\\\n\r]/g, (c) => encodeURIComponent(c))}")`;

/**
 * O ENQUADRAMENTO da imagem de fundo: o PONTO FOCAL (`x`,`y` em % — o que fica sempre à vista quando a moldura corta a
 * imagem) e o ZOOM (1 = a imagem cobre a moldura; até `ZOOM_FUNDO_MAX`). A moldura muda de proporção com a tela — por
 * isso o enquadramento é um ponto + zoom, não um recorte fixo.
 */
export type AjusteFundo = { x: number; y: number; zoom: number };
export const AJUSTE_FUNDO_PADRAO: AjusteFundo = { x: 50, y: 50, zoom: 1 };
export const ZOOM_FUNDO_MAX = 3;
/** A proporção IDEAL da imagem (a da moldura num monitor comum) e a resolução mínima recomendada. */
export const PROPORCAO_FUNDO = 16 / 9;
export const LARGURA_MIN_FUNDO = 1920;
export const ALTURA_MIN_FUNDO = 1080;

const lim = (v: unknown, a: number, b: number, padrao: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : padrao;
};

/** Lê o enquadramento gravado (JSON ou objeto) — qualquer coisa inválida vira o padrão, campo a campo. */
export function lerAjusteFundo(v: unknown): AjusteFundo {
  let o: unknown = v;
  if (typeof v === "string")
    try {
      o = JSON.parse(v);
    } catch {
      return AJUSTE_FUNDO_PADRAO;
    }
  if (!o || typeof o !== "object") return AJUSTE_FUNDO_PADRAO;
  const a = o as Record<string, unknown>;
  return { x: lim(a.x, 0, 100, 50), y: lim(a.y, 0, 100, 50), zoom: lim(a.zoom, 1, ZOOM_FUNDO_MAX, 1) };
}

/** O estilo da `<img>` de fundo (`object-fit: cover` + o ponto focal + o zoom a partir dele). */
export function estiloFundo(a: AjusteFundo) {
  const pos = `${a.x}% ${a.y}%`;
  return { objectPosition: pos, transformOrigin: pos, transform: a.zoom > 1 ? `scale(${a.zoom})` : undefined };
}

/**
 * ARRASTAR a imagem na prévia (px): o conteúdo acompanha o dedo — arrastar para a direita mostra mais da ESQUERDA (o
 * ponto focal anda para a esquerda). `larguraImg`/`alturaImg` = o tamanho que a imagem COBRE na prévia (com o zoom);
 * `larguraBox`/`alturaBox` = a prévia. Sem sobra num eixo, ele não anda.
 */
export function arrastarFundo(a: AjusteFundo, dx: number, dy: number, box: { w: number; h: number }, img: { w: number; h: number }): AjusteFundo {
  if (img.w <= 0 || img.h <= 0 || box.w <= 0 || box.h <= 0) return a;
  // O tamanho da imagem "cover" na prévia, com o zoom.
  const escala = Math.max(box.w / img.w, box.h / img.h) * a.zoom;
  const sobraX = img.w * escala - box.w;
  const sobraY = img.h * escala - box.h;
  return {
    ...a,
    x: sobraX > 0 ? lim(a.x - (dx / sobraX) * 100, 0, 100, 50) : a.x,
    y: sobraY > 0 ? lim(a.y - (dy / sobraY) * 100, 0, 100, 50) : a.y,
  };
}

/** A imagem serve de fundo? Avisos da proporção (retrato/muito estreita) e da resolução (pequena demais = borrada). */
export function avaliarImagemFundo(w: number, h: number): string[] {
  if (w <= 0 || h <= 0) return [];
  const avisos: string[] = [];
  const p = w / h;
  if (p < 1) avisos.push("A imagem é em RETRATO — no quadro (paisagem) ela será bem cortada em cima e embaixo. Prefira paisagem 16:9.");
  else if (p < 1.3 || p > 2.4) avisos.push(`A proporção é ${p.toFixed(2).replace(".", ",")}:1 — o ideal é 16:9 (1,78:1); parte da imagem será cortada.`);
  if (w < LARGURA_MIN_FUNDO * 0.75 || h < ALTURA_MIN_FUNDO * 0.75)
    avisos.push(`Resolução baixa (${w}×${h} px) — em telas grandes ficará borrada. O ideal é ${LARGURA_MIN_FUNDO}×${ALTURA_MIN_FUNDO} px ou mais.`);
  return avisos;
}
