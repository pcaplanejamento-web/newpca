import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { hashSenha, sha256Hex, toHex, verificarSenha } from "./password";
import { sessoes, usuarios } from "@/db/schema";

/**
 * Autenticação própria e enxuta, 100% Web Crypto (compatível com Cloudflare
 * Workers). Criptografia de senha/token fica em `./password`; aqui tratamos
 * sessão no D1 (guardando apenas o hash do token) e cookie httpOnly + Secure.
 */

const COOKIE = "pca_session";
const SESSAO_DIAS = 7;

export { hashSenha, verificarSenha };

export type UsuarioSessao = {
  id: number;
  email: string;
  nome: string;
  matricula: string | null;
  foto: string | null;
  role: "admin" | "gestor" | "membro";
  status: "ativo" | "pendente" | "inativo";
};

/**
 * Troca a senha do usuário: confere a senha atual e grava o novo hash.
 * Retorna `false` se a senha atual estiver incorreta (o chamado decide a msg).
 */
export async function atualizarSenha(
  usuarioId: number,
  atual: string,
  nova: string,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ senhaHash: usuarios.senhaHash })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1);
  if (!row || !(await verificarSenha(atual, row.senhaHash))) return false;
  const novoHash = await hashSenha(nova);
  await db
    .update(usuarios)
    .set({ senhaHash: novoHash, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(usuarios.id, usuarioId));
  return true;
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
      matricula: usuarios.matricula,
      foto: usuarios.foto,
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
