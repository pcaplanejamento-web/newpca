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
    return u.hostname === "i.pinimg.com" || u.hostname === "images.unsplash.com" || /\.(jpe?g|png|webp|gif|avif|bmp|svg)$/i.test(u.pathname);
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

/**
 * O DEGRADÊ de fundo do quadro (no lugar de uma imagem): 2 ou 3 cores hex e o ângulo. `cssGradiente` monta o CSS só com
 * hex validados (nunca texto livre — sem injeção de CSS).
 */
export type Gradiente = { cores: string[]; angulo: number };
export const ANGULOS_GRADIENTE = [0, 45, 90, 135, 180, 225, 270, 315] as const;

/** Os DEGRADÊS predefinidos (como os do Trello) — o nome é o rótulo acessível. */
export const GRADIENTES_PADRAO: readonly { nome: string; g: Gradiente }[] = [
  { nome: "Oceano", g: { cores: ["#0c66e4", "#09326c"], angulo: 135 } },
  { nome: "Aurora", g: { cores: ["#6cc3e0", "#9f8fef"], angulo: 135 } },
  { nome: "Lavanda", g: { cores: ["#c9a7f5", "#6e5dc6"], angulo: 135 } },
  { nome: "Pôr do sol", g: { cores: ["#fea362", "#e774bb"], angulo: 135 } },
  { nome: "Fogo", g: { cores: ["#f87168", "#c25100"], angulo: 135 } },
  { nome: "Pêssego", g: { cores: ["#fedec8", "#fea362"], angulo: 135 } },
  { nome: "Floresta", g: { cores: ["#4bce97", "#1f845a"], angulo: 135 } },
  { nome: "Lima", g: { cores: ["#94c748", "#227d9b"], angulo: 135 } },
  { nome: "Noite", g: { cores: ["#1d2125", "#626f86"], angulo: 135 } },
  { nome: "Neblina", g: { cores: ["#dcdfe4", "#8590a2"], angulo: 135 } },
];

const HEX = /^#[0-9a-f]{6}$/i;

/** Lê o degradê gravado (JSON ou objeto): 2–3 cores hex e um ângulo 0–359; qualquer coisa inválida = `null`. */
export function lerGradiente(v: unknown): Gradiente | null {
  let o: unknown = v;
  if (typeof v === "string")
    try {
      o = JSON.parse(v);
    } catch {
      return null;
    }
  if (!o || typeof o !== "object") return null;
  const g = o as Record<string, unknown>;
  const cores = Array.isArray(g.cores) ? g.cores.filter((c): c is string => typeof c === "string" && HEX.test(c)).map((c) => c.toLowerCase()) : [];
  if (cores.length < 2 || cores.length > 3) return null;
  const a = Number(g.angulo);
  return { cores, angulo: Number.isFinite(a) ? ((Math.round(a) % 360) + 360) % 360 : 135 };
}

/** O CSS do degradê (`linear-gradient(…)`) — só com o que `lerGradiente` aceitou. */
export const cssGradiente = (g: Gradiente) => `linear-gradient(${g.angulo}deg, ${g.cores.join(", ")})`;

/** Dois degradês são o MESMO (o predefinido marcado no seletor)? */
export const mesmoGradiente = (a: Gradiente | null, b: Gradiente | null) => !!a && !!b && a.angulo === b.angulo && a.cores.join() === b.cores.join();

/** O FUNDO do quadro, como a tela o escolhe: nada (o padrão do sistema), uma imagem (link) ou um degradê. */
export type FundoEscolha = { tipo: "nenhum" } | { tipo: "imagem"; url: string } | { tipo: "gradiente"; g: Gradiente };

/** O fundo gravado (imagem vence o degradê; os dois ausentes = o padrão do sistema). */
export function fundoDoQuadro(q: { fundoUrl: string | null; fundoGradiente: string | null }): FundoEscolha {
  if (q.fundoUrl) return { tipo: "imagem", url: q.fundoUrl };
  const g = lerGradiente(q.fundoGradiente);
  return g ? { tipo: "gradiente", g } : { tipo: "nenhum" };
}

/** O corpo da gravação de um fundo escolhido (`PATCH`/`POST` do quadro) — um exclui o outro. */
export function corpoFundo(f: FundoEscolha): { fundoUrl: string | null; fundoGradiente: Gradiente | null } {
  return f.tipo === "imagem" ? { fundoUrl: f.url, fundoGradiente: null } : f.tipo === "gradiente" ? { fundoUrl: null, fundoGradiente: f.g } : { fundoUrl: null, fundoGradiente: null };
}

/**
 * FOTOS de fundo (a galeria do "Novo quadro" e da Configuração): com a chave do Unsplash, a BUSCA de verdade (no
 * servidor); sem ela, uma seleção fixa do Picsum (fotos do Unsplash, links estáveis, sem chave). `miniatura` = 16:9
 * pequena; `url` = 1920×1080.
 */
export type FotoFundo = { id: string; miniatura: string; url: string; autor?: string; link?: string };

/** As PESQUISAS SUGERIDAS (chips — como as do Trello). */
export const PESQUISAS_SUGERIDAS = ["Natureza", "Montanhas", "Oceano", "Cidades", "Minimalista", "Colorido", "Espaço", "Floresta", "Produtividade", "Negócios"] as const;

/** A seleção FIXA (Picsum) — paisagens 16:9. */
const IDS_PICSUM = [10, 11, 13, 15, 16, 17, 18, 28, 29, 43, 49, 57, 76, 84, 103, 110, 116, 124, 128, 142, 164, 184, 188, 191];
export const fotosPicsum = (): FotoFundo[] =>
  IDS_PICSUM.map((id) => ({ id: `picsum-${id}`, miniatura: `https://picsum.photos/id/${id}/400/225`, url: `https://picsum.photos/id/${id}/1920/1080`, link: "https://picsum.photos" }));

/** Lê a resposta da API do Unsplash (busca ou lista) — tolerante; só fotos com URL https. */
export function fotosDoUnsplash(json: unknown): FotoFundo[] {
  const lista = Array.isArray(json) ? json : json && typeof json === "object" && Array.isArray((json as { results?: unknown }).results) ? (json as { results: unknown[] }).results : [];
  const fotos: FotoFundo[] = [];
  for (const f of lista) {
    if (!f || typeof f !== "object") continue;
    const o = f as { id?: unknown; urls?: Record<string, unknown>; user?: { name?: unknown; links?: { html?: unknown } }; links?: { html?: unknown } };
    const raw = typeof o.urls?.raw === "string" ? o.urls.raw : null;
    if (typeof o.id !== "string" || !raw?.startsWith("https://")) continue;
    const sep = raw.includes("?") ? "&" : "?";
    fotos.push({
      id: o.id,
      miniatura: `${raw}${sep}w=400&h=225&fit=crop&auto=format&q=70`,
      url: `${raw}${sep}w=1920&h=1080&fit=crop&auto=format&q=80`,
      autor: typeof o.user?.name === "string" ? o.user.name : undefined,
      link: typeof o.links?.html === "string" ? o.links.html : undefined,
    });
  }
  return fotos;
}
