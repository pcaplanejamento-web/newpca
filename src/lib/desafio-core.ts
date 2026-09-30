/**
 * VERIFICAÇÃO ANTI-ROBÔ PRÓPRIA (prova de trabalho) — o captcha do sistema quando o Turnstile não está configurado: o
 * servidor entrega um DESAFIO aleatório (vale UMA vez, por pouco tempo) e o navegador procura o número `n` tal que
 * SHA-256("desafio:n") comece com `BITS_DESAFIO` bits zero (~1 s num celular; caro para quem tenta em massa). O servidor
 * confere com UM hash. Puro (sem DOM nem Web Crypto): o MESMO SHA-256 no navegador, no servidor e nos testes.
 */

/** Bits zero exigidos no início do hash (≈ 2^17 = 131 mil tentativas em média). */
export const BITS_DESAFIO = 17;
/** Validade do desafio (s). */
export const VALIDADE_DESAFIO_S = 10 * 60;
/** Prefixo do token da verificação própria (o do Turnstile nunca começa assim). */
export const PREFIXO_DESAFIO = "pow1.";

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
  0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
  0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
  0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const W = new Uint32Array(64);

/** SHA-256 de um texto ASCII (o desafio é hexadecimal e o número, decimal) → os 8 números de 32 bits do resumo. */
export function sha256Ascii(texto: string): Uint32Array {
  const n = texto.length;
  const blocos = ((n + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(blocos);
  for (let i = 0; i < n; i++) m[i] = texto.charCodeAt(i) & 0xff;
  m[n] = 0x80;
  const bits = n * 8;
  m[blocos - 4] = (bits >>> 24) & 0xff;
  m[blocos - 3] = (bits >>> 16) & 0xff;
  m[blocos - 2] = (bits >>> 8) & 0xff;
  m[blocos - 1] = bits & 0xff;
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  for (let o = 0; o < blocos; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = (m[o + i * 4] << 24) | (m[o + i * 4 + 1] << 16) | (m[o + i * 4 + 2] << 8) | m[o + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15];
      const b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  return h;
}

/** O resumo começa com `bits` bits zero? */
export function comecaComZeros(h: Uint32Array, bits: number): boolean {
  let resta = bits;
  for (let i = 0; resta > 0; i++) {
    const k = Math.min(32, resta);
    if (k === 32 ? h[i] !== 0 : h[i] >>> (32 - k) !== 0) return false;
    resta -= k;
  }
  return true;
}

/** O número `n` resolve o desafio? */
export function solucaoValida(desafio: string, n: number, bits = BITS_DESAFIO): boolean {
  return Number.isSafeInteger(n) && n >= 0 && comecaComZeros(sha256Ascii(`${desafio}:${n}`), bits);
}

/** Procura a solução a partir de `de`, por até `passos` números (em fatias — a tela não trava). `null` = não achou nesta fatia. */
export function procurarSolucao(desafio: string, de: number, passos: number, bits = BITS_DESAFIO): number | null {
  for (let n = de; n < de + passos; n++) if (comecaComZeros(sha256Ascii(`${desafio}:${n}`), bits)) return n;
  return null;
}

/** O desafio: 32 caracteres hexadecimais. */
export const desafioValido = (d: string) => /^[0-9a-f]{32}$/.test(d);

/** O TOKEN enviado com o formulário: `pow1.<desafio>.<n>`. */
export function tokenDesafio(desafio: string, n: number): string {
  return `${PREFIXO_DESAFIO}${desafio}.${n}`;
}

/** Lê o token (ou `null` se não é da verificação própria / malformado). */
export function lerTokenDesafio(token: string | null | undefined): { desafio: string; n: number } | null {
  if (!token?.startsWith(PREFIXO_DESAFIO)) return null;
  const [desafio, nTxt] = token.slice(PREFIXO_DESAFIO.length).split(".");
  if (!desafio || !desafioValido(desafio) || !/^\d{1,15}$/.test(nTxt ?? "")) return null;
  return { desafio, n: Number(nTxt) };
}
