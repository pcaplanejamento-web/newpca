/**
 * Valor (px) de um token de ESPAÇAMENTO do tema (`--pad-canvas`, `--gap-block`…) lido do CSS vivo — a MESMA fonte
 * das classes `p-[var(--pad-canvas)]`/`space-y-[var(--gap-block)]` (a densidade do ADM e o celular mudam o valor).
 * Para as medidas feitas em JS (altura das tabelas com rolagem interna, lugar da barra de seleção fixa). Sem DOM
 * (renderização no servidor), o `padrao`.
 */
export function tokenPx(nome: `--${string}`, padrao: number): number {
  if (typeof document === "undefined") return padrao;
  const v = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(nome));
  return Number.isFinite(v) ? v : padrao;
}
