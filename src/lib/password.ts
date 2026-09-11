/**
 * Criptografia de senhas e tokens — 100% Web Crypto, SEM dependências de
 * request/DB. Fica isolado aqui para ser testável e reutilizável (o `auth.ts`
 * o consome para senhas e hash de token de sessão).
 *
 * Senhas: PBKDF2-SHA256 + salt aleatório, formato `pbkdf2$<iter>$<salt>$<hash>`.
 */

// 100.000 é o MÁXIMO permitido pelo Cloudflare Workers para PBKDF2 (acima disso
// o deriveBits lança "iteration counts above 100000 are not supported"). É o
// teto do ambiente; com salt aleatório + sessão no servidor, adequado ao uso interno.
export const PBKDF2_ITER = 100_000;
const enc = new TextEncoder();

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Comparação de tempo constante (evita timing attack). */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

async function derivar(senha: string, salt: Uint8Array, iter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(senha), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: iter, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits);
}

export async function hashSenha(senha: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(senha, salt, PBKDF2_ITER);
  return `pbkdf2$${PBKDF2_ITER}$${toHex(salt)}$${hash}`;
}

export async function verificarSenha(senha: string, armazenado: string): Promise<boolean> {
  const [alg, iterStr, saltHex, hashHex] = armazenado.split("$");
  if (alg !== "pbkdf2" || !iterStr || !saltHex || !hashHex) return false;
  const hash = await derivar(senha, fromHex(saltHex), Number(iterStr));
  return iguaisEmTempoConstante(hash, hashHex);
}
