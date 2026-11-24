/**
 * Régua PURA do gesto de FECHAR deslizando (folhas que sobem de baixo, a gaveta do menu): quanto o dedo andou na direção
 * de fechar, contra o tamanho do painel e a velocidade da soltura. Sem DOM — testada em `tests/gesto-fechar.test.ts`.
 */

/** O dedo precisa andar isto (px) na direção de fechar antes de o gesto valer — abaixo disso é um toque ou rolagem. */
export const LIMIAR_GESTO = 8;
/** Fração do tamanho do painel que, arrastada, fecha ao soltar. */
export const FRACAO_FECHAR = 0.3;
/** Velocidade (px/ms) que fecha mesmo com pouca distância — o "peteleco". */
export const VELOCIDADE_FECHAR = 0.5;

/** Quanto o painel segue o dedo: na direção de fechar, 1:1; na contrária, quase nada (resiste, nunca abre além). */
export function deslocamento(delta: number): number {
  return delta >= 0 ? delta : delta / 6;
}

/**
 * O gesto começou de verdade? Só quando o movimento é PRINCIPALMENTE no eixo de fechar e já passou do limiar — assim uma
 * rolagem de lado (tabela, barra que rola) ou um toque não arrastam o painel.
 */
export function gestoComecou(principal: number, cruzado: number): boolean {
  return principal > LIMIAR_GESTO && principal > Math.abs(cruzado) * 1.2;
}

/** Ao soltar: fecha quando passou da fração do tamanho ou quando saiu rápido na direção de fechar. */
export function deveFechar(delta: number, tamanho: number, velocidade: number): boolean {
  if (delta <= 0) return false;
  if (tamanho > 0 && delta >= tamanho * FRACAO_FECHAR) return true;
  return velocidade >= VELOCIDADE_FECHAR && delta > LIMIAR_GESTO * 2;
}

/** CARROSSEL de camadas (Protocolo · DFD · Item no celular): quanto o trilho anda com o dedo — 1:1 entre camadas e com
 * resistência além da primeira/última (o puxão "de borracha"). `delta` > 0 = o dedo foi para a DIREITA (camada anterior). */
export function deslocamentoCarrossel(delta: number, indice: number, total: number): number {
  const alemDoInicio = indice === 0 && delta > 0;
  const alemDoFim = indice >= total - 1 && delta < 0;
  return alemDoInicio || alemDoFim ? delta / 4 : delta;
}

/** Ao soltar o carrossel: a camada de destino — a vizinha quando o dedo passou de 25% da largura ou saiu rápido. */
export function camadaAoSoltar(indice: number, total: number, delta: number, largura: number, velocidade: number): number {
  const passou = largura > 0 && Math.abs(delta) >= largura * 0.25;
  // O peteleco só vale no MESMO sentido do arrasto (desistir e puxar de volta nunca leva à camada do outro lado).
  const peteleco = Math.sign(velocidade) === Math.sign(delta) && Math.abs(velocidade) >= VELOCIDADE_FECHAR && Math.abs(delta) > LIMIAR_GESTO * 2;
  if (!passou && !peteleco) return indice;
  const alvo = delta < 0 ? indice + 1 : indice - 1;
  return Math.max(0, Math.min(total - 1, alvo));
}
