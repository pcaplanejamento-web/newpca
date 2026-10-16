/**
 * FAVORITOS da pesquisa do sistema (o banner Ctrl+K) — guardados na conta da pessoa (`preferencias_tabela`, chave
 * `CHAVE_FAVORITOS`), valem em todo aparelho. Núcleo puro: ler qualquer JSON com segurança, alternar e reordenar.
 */
export const CHAVE_FAVORITOS = "pesquisa:favoritos";
export const MAX_FAVORITOS = 20;

export type FavoritoPesquisa = { chave: string; rotulo: string; caminho?: string[]; detalhe?: string; href: string; tipo: string };

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Só caminho INTERNO do painel (nunca outro site nem "//"). */
export const hrefInterno = (h: unknown): h is string => typeof h === "string" && /^\/painel(\/|\?|$)/.test(h) && !h.startsWith("//") && h.length <= 300;

/** Qualquer valor → a lista válida (sem repetir a chave, até o teto). */
export function lerFavoritos(v: unknown): FavoritoPesquisa[] {
  const lista = Array.isArray(v) ? v : v && typeof v === "object" && Array.isArray((v as { itens?: unknown }).itens) ? (v as { itens: unknown[] }).itens : [];
  const vistos = new Set<string>();
  const out: FavoritoPesquisa[] = [];
  for (const x of lista) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const chave = texto(o.chave, 120);
    const rotulo = texto(o.rotulo, 200);
    if (!chave || !rotulo || !hrefInterno(o.href) || vistos.has(chave)) continue;
    vistos.add(chave);
    const caminho = Array.isArray(o.caminho) ? o.caminho.map((c) => texto(c, 80)).filter(Boolean).slice(0, 4) : [];
    const detalhe = texto(o.detalhe, 200);
    out.push({ chave, rotulo, href: o.href, tipo: texto(o.tipo, 30) || "tela", ...(caminho.length ? { caminho } : {}), ...(detalhe ? { detalhe } : {}) });
    if (out.length >= MAX_FAVORITOS) break;
  }
  return out;
}

/** Liga/desliga: o novo entra no TOPO; cheio = não entra (`cheio: true`). */
export function alternarFavorito(lista: FavoritoPesquisa[], f: FavoritoPesquisa): { lista: FavoritoPesquisa[]; cheio: boolean } {
  if (lista.some((x) => x.chave === f.chave)) return { lista: lista.filter((x) => x.chave !== f.chave), cheio: false };
  if (lista.length >= MAX_FAVORITOS) return { lista, cheio: true };
  return { lista: lerFavoritos([f, ...lista]), cheio: false };
}

/** Move o favorito `de` uma posição para cima (-1) ou para baixo (+1). */
export function moverFavorito(lista: FavoritoPesquisa[], chave: string, passo: -1 | 1): FavoritoPesquisa[] {
  const i = lista.findIndex((x) => x.chave === chave);
  const j = i + passo;
  if (i < 0 || j < 0 || j >= lista.length) return lista;
  const n = [...lista];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}
