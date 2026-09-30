import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { hashSenha, sha256Hex, toHex, verificarSenha } from "./password";
import { urlFoto } from "./pessoa";
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
  /** Apelido (perfil) — o nome de exibição no sistema (`nomeExibicao`). */
  apelido: string | null;
  matricula: string | null;
  /** URL da foto (rota com cache — `urlFoto`), nunca o data-URL: a sessão é lida em TODA requisição. */
  foto: string | null;
  role: "admin" | "gestor" | "membro";
  status: "ativo" | "pendente" | "inativo";
  /** O ADM exigiu uma SENHA NOVA: o painel leva a pessoa a `/nova-senha` antes de qualquer tela. */
  trocarSenha: boolean;
};

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

/** O id da sessão ATUAL (pelo cookie) — trocar a senha encerra as OUTRAS sessões e mantém esta. */
export async function sessaoAtualId(): Promise<number | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [r] = await getDb().select({ id: sessoes.id }).from(sessoes).where(eq(sessoes.tokenHash, await sha256Hex(token))).limit(1);
  return r?.id ?? null;
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
      apelido: usuarios.apelido,
      matricula: usuarios.matricula,
      // A FOTO não é lida aqui (pode ter centenas de KB): só se existe + a versão da URL com cache.
      temFoto: sql<number>`(${usuarios.foto} IS NOT NULL AND ${usuarios.foto} <> '')`,
      versao: usuarios.atualizadoEm,
      role: usuarios.role,
      status: usuarios.status,
      trocarSenha: usuarios.trocarSenha,
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
  if (row?.status !== "ativo") return null;
  const { temFoto, versao, ...u } = row;
  return { ...u, apelido: u.apelido ?? null, foto: urlFoto(u.id, !!temFoto, versao) };
}

/** Quantos usuários existem (para o bootstrap do primeiro admin). */
export async function contarUsuarios(): Promise<number> {
  const [r] = await getDb()
    .select({ n: sql<number>`COUNT(*)` })
    .from(usuarios);
  return Number(r?.n ?? 0);
}
