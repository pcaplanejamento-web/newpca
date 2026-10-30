/** Menor ângulo desenhado (~2,3°): a fatia de 0,5% continua visível; o que falta sai das fatias maiores. */
export const ANG_MIN = 0.04;

/** Ângulos das fatias: proporcionais, com piso ANG_MIN — a soma segue sendo a volta inteira. */
export function angulosPizza(valores: number[]): number[] {
  const total = valores.reduce((t, v) => t + v, 0);
  if (!total) return valores.map(() => 0);
  const brutos = valores.map((v) => (v / total) * 2 * Math.PI);
  if (valores.length < 2) return brutos;
  const falta = brutos.reduce((t, a) => t + Math.max(0, ANG_MIN - a), 0);
  const folga = brutos.reduce((t, a) => t + Math.max(0, a - ANG_MIN), 0);
  if (!falta || folga <= falta) return brutos;
  return brutos.map((a) => (a < ANG_MIN ? ANG_MIN : a - ((a - ANG_MIN) / folga) * falta));
}
