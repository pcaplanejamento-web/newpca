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
