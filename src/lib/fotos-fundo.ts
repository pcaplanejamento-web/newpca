import { getCloudflareContext } from "@opennextjs/cloudflare";
import { type FotoFundo, fotosDoUnsplash, fotosPicsum } from "./imagem-fundo-core";

/**
 * FOTOS DE FUNDO do quadro (só escopo de request): com o Worker Secret `UNSPLASH_ACCESS_KEY`, a BUSCA do Unsplash (como a
 * do Trello — `q` vazio = as fotos em destaque em paisagem); sem a chave (ou se o Unsplash falhar), a seleção fixa do
 * Picsum. Resultados em memória por 10 minutos (a mesma busca não gasta a cota da API de novo).
 */
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { em: number; fotos: FotoFundo[] }>();

export async function buscarFotosFundo(q: string): Promise<{ fonte: "unsplash" | "picsum"; fotos: FotoFundo[] }> {
  const { env } = getCloudflareContext();
  const chave = (env as unknown as { UNSPLASH_ACCESS_KEY?: string }).UNSPLASH_ACCESS_KEY;
  const termo = q.trim().slice(0, 60);
  if (!chave) return { fonte: "picsum", fotos: fotosPicsum() };
  const c = cache.get(termo);
  if (c && Date.now() - c.em < CACHE_MS) return { fonte: "unsplash", fotos: c.fotos };
  const url = termo
    ? `https://api.unsplash.com/search/photos?query=${encodeURIComponent(termo)}&per_page=24&orientation=landscape&content_filter=high`
    : "https://api.unsplash.com/photos?per_page=24&order_by=popular";
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(url, { signal: ctl.signal, headers: { Authorization: `Client-ID ${chave}`, "Accept-Version": "v1" } }).finally(() => clearTimeout(t));
    if (!r.ok) throw new Error(`Unsplash respondeu ${r.status}`);
    const fotos = fotosDoUnsplash(await r.json());
    if (cache.size > 50) cache.delete(cache.keys().next().value as string);
    cache.set(termo, { em: Date.now(), fotos });
    return { fonte: "unsplash", fotos };
  } catch (e) {
    console.error("busca de fotos (Unsplash) falhou", e);
    return { fonte: "picsum", fotos: fotosPicsum() };
  }
}
