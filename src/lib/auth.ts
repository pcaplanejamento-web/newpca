import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { sessoes, usuarios } from "@/db/schema";

/**
 * Autenticação própria e enxuta, 100% Web Crypto (compatível com Cloudflare
 * Workers). Senhas com PBKDF2-SHA256 (210k iterações, padrão OWASP); sessão
 * no D1 guardando apenas o hash do token; cookie httpOnly + Secure.
 */

const COOKIE = "pca_session";
const SESSAO_DIAS = 7;
const PBKDF2_ITER = 210_000;
const enc = new TextEncoder();

export type UsuarioSessao = {
  id: number;
  email: string;
  nome: string;
  role: "admin" | "gestor" | "membro";
  status: "ativo" | "pendente" | "inativo";
};

// ---------------------------------------------------------------------------
// util
// ---------------------------------------------------------------------------
function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Comparação de tempo constante (evita timing attack). */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(s: string): Promise<string> {
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

// ---------------------------------------------------------------------------
// senhas
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// sessões
// ---------------------------------------------------------------------------
export async function criarSessao(usuarioId: number): Promise<string> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(token);
  const expiraEm = new Date(Date.now() + SESSAO_DIAS * 86_400_000).toISOString();
  await getDb().insert(sessoes).values({ tokenHash, usuarioId, expiraEm });
  return token;
}

export async function definirCookieSessao(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSAO_DIAS * 86_400,
  });
}

export async function encerrarSessaoAtual(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const tokenHash = await sha256Hex(token);
    await getDb().delete(sessoes).where(eq(sessoes.tokenHash, tokenHash));
  }
  jar.delete(COOKIE);
}

/** Usuário logado (ou null). Só retorna se a sessão é válida e o usuário ativo. */
export async function getUsuarioAtual(): Promise<UsuarioSessao | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const [row] = await getDb()
    .select({
      id: usuarios.id,
      email: usuarios.email,
      nome: usuarios.nome,
      role: usuarios.role,
      status: usuarios.status,
    })
    .from(sessoes)
    .innerJoin(usuarios, eq(sessoes.usuarioId, usuarios.id))
    .where(
      and(
        eq(sessoes.tokenHash, tokenHash),
        gt(sessoes.expiraEm, new Date().toISOString()),
      ),
    )
    .limit(1);
  if (!row || row.status !== "ativo") return null;
  return row as UsuarioSessao;
}

/** Quantos usuários existem (para o bootstrap do primeiro admin). */
export async function contarUsuarios(): Promise<number> {
  const [r] = await getDb()
    .select({ n: sql<number>`COUNT(*)` })
    .from(usuarios);
  return Number(r?.n ?? 0);
}
