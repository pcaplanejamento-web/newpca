/**
 * A ÁREA VISÍVEL do display para os painéis flutuantes (Dropdown, dicas, janelas): a largura SEM a barra de rolagem
 * (`clientWidth` — o `innerWidth` a inclui e o painel ficava por baixo dela) e a altura da viewport VISUAL (no celular,
 * a barra do navegador e o teclado tiram altura), menos uma margem. Todo painel que se posiciona sozinho usa esta régua:
 * nenhuma parte fica fora do display.
 */
export const MARGEM_TELA = 8;

export function areaVisivel(margem = MARGEM_TELA): { esquerda: number; topo: number; direita: number; base: number; largura: number; altura: number } {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const doc = typeof document !== "undefined" ? document.documentElement : null;
  const larg = Math.min(doc?.clientWidth || window.innerWidth, vv ? vv.width + vv.offsetLeft : Number.POSITIVE_INFINITY);
  const alt = Math.min(doc?.clientHeight || window.innerHeight, vv ? vv.height + vv.offsetTop : Number.POSITIVE_INFINITY, window.innerHeight);
  const esquerda = margem + (vv?.offsetLeft ?? 0);
  const topo = margem + (vv?.offsetTop ?? 0);
  return { esquerda, topo, direita: larg - margem, base: alt - margem, largura: Math.max(0, larg - esquerda - margem), altura: Math.max(0, alt - topo - margem) };
}

/** Um valor entre o mínimo e o máximo (o máximo vence quando o espaço não cabe). */
export function entre(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(v, Math.max(min, max)));
}
