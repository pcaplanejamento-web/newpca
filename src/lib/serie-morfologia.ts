// MORFOLOGIA das séries de um gráfico — a base da transição "como água" do SerieTemporal (puro, testável).
//
// Cada linha do desenho tem uma POSIÇÃO no tempo (`t`) e um valor por série. Para passar de um desenho a outro — com os
// mesmos pontos ou com outros (Dia → Mês, zoom, outro período) — as duas curvas são amostradas nas MESMAS posições (a união
// das posições dos dois) pela MESMA curva com que o gráfico desenha (a monótona do d3, `curveMonotoneX`): no início o
// quadro é a curva antiga, no fim a nova, e cada quadro intermediário é a mistura das duas. A janela de datas (o domínio
// do eixo X) também desliza — o zoom anima.

/** Uma linha do desenho: a chave do ponto (o mais perto, na mistura), a posição no tempo e os valores das séries. */
export type LinhaSerie = { chave: string; t: number } & Record<string, number | string>;
/** Um quadro: as linhas e a janela do eixo X (de `lo` a `hi`). */
export type QuadroSerie = { linhas: LinhaSerie[]; lo: number; hi: number };

/** As tangentes da curva monótona (as do `curveMonotoneX` do d3: Steffen — nunca passa dos valores vizinhos). */
function tangentes(xs: number[], ys: number[]): number[] {
  const n = xs.length;
  const m = new Array<number>(n).fill(0);
  if (n < 2) return m;
  const s = (i: number) => {
    const h = xs[i + 1] - xs[i];
    return h ? (ys[i + 1] - ys[i]) / h : 0;
  };
  for (let i = 1; i < n - 1; i++) {
    const h0 = xs[i] - xs[i - 1];
    const h1 = xs[i + 1] - xs[i];
    const s0 = s(i - 1);
    const s1 = s(i);
    const p = h0 + h1 ? (s0 * h1 + s1 * h0) / (h0 + h1) : 0;
    m[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  const ponta = (h: number, d: number, t: number) => (h ? (3 * d - t) / 2 : t);
  m[0] = ponta(xs[1] - xs[0], s(0), m[1]);
  m[n - 1] = ponta(xs[n - 1] - xs[n - 2], s(n - 2), m[n - 2]);
  return m;
}

/**
 * Os valores da curva monótona que passa por (xs, ys) nas posições `qs` (todas em ordem crescente; xs também). Fora do
 * intervalo, o valor da ponta mais perto (o desenho não inventa tendência). Linear no total de pontos.
 */
export function amostrarMonotona(xs: number[], ys: number[], qs: number[]): number[] {
  const n = xs.length;
  if (!n) return qs.map(() => 0);
  if (n === 1) return qs.map(() => ys[0]);
  const m = tangentes(xs, ys);
  const out = new Array<number>(qs.length);
  let i = 0;
  for (let k = 0; k < qs.length; k++) {
    const q = qs[k];
    if (q <= xs[0]) {
      out[k] = ys[0];
      continue;
    }
    if (q >= xs[n - 1]) {
      out[k] = ys[n - 1];
      continue;
    }
    while (i < n - 2 && q > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const u = h ? (q - xs[i]) / h : 0;
    const u2 = u * u;
    const u3 = u2 * u;
    out[k] = (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h * m[i + 1];
  }
  return out;
}

/** As posições dos dois quadros juntas, em ordem e sem repetir. */
function uniao(a: number[], b: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const v = j >= b.length || (i < a.length && a[i] <= b[j]) ? a[i++] : b[j++];
    if (out.length === 0 || v !== out[out.length - 1]) out.push(v);
  }
  return out;
}

/**
 * A MORFOLOGIA de `de` para `para`: devolve o quadro de cada instante `k` (0 = `de`, 1 = `para` — o próprio, intacto). As
 * duas curvas são amostradas uma vez na união das posições; cada quadro só mistura números. Sem linhas num dos lados, o
 * quadro é o outro (nada a misturar).
 */
export function morfologia(de: QuadroSerie, para: QuadroSerie, chaves: readonly string[]): (k: number) => QuadroSerie {
  if (!de.linhas.length || !para.linhas.length) return () => para;
  const ts = uniao(
    de.linhas.map((l) => l.t),
    para.linhas.map((l) => l.t),
  );
  const amostra = (q: QuadroSerie, c: string) =>
    amostrarMonotona(
      q.linhas.map((l) => l.t),
      q.linhas.map((l) => Number(l[c]) || 0),
      ts,
    );
  const ini = chaves.map((c) => amostra(de, c));
  const fim = chaves.map((c) => amostra(para, c));
  // A chave de cada posição = a do ponto NOVO mais perto (a dica e o clique durante a transição já falam do desenho novo).
  const pts = para.linhas;
  let j = 0;
  const chaveDe = ts.map((t) => {
    while (j < pts.length - 1 && Math.abs(pts[j + 1].t - t) <= Math.abs(pts[j].t - t)) j++;
    return pts[j].chave;
  });
  return (k) => {
    if (k >= 1) return para;
    const linhas = ts.map((t, i) => {
      const l: LinhaSerie = { chave: chaveDe[i], t };
      for (let c = 0; c < chaves.length; c++) l[chaves[c]] = ini[c][i] + (fim[c][i] - ini[c][i]) * k;
      return l;
    });
    return { linhas, lo: de.lo + (para.lo - de.lo) * k, hi: de.hi + (para.hi - de.hi) * k };
  };
}
