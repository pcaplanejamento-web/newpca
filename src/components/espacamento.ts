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

/**
 * Layout de DESKTOP? — o MESMO breakpoint `lg` do Tailwind (`64rem`; numa media query o rem é o tamanho de fonte do
 * NAVEGADOR, então com a fonte ampliada o corte passa de 1024px). Medidas em JS que dependem do layout usam este teste,
 * nunca `innerWidth < 1024` — senão, entre um corte e outro, o JS mediria o desktop sobre o CSS do celular.
 */
export function ehDesktop(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 64rem)").matches;
}
