import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { grupos, permissoes, usuarioGrupos } from "@/db/schema";
import { ABAS } from "./abas";
import { getUsuarioAtual, type UsuarioSessao } from "./auth";
import { getDb } from "./db";

/**
 * RBAC por grupo. Um usuário pode estar em vários grupos e escolhe o ativo no
 * cabeçalho (cookie `pca_grupo`). O grupo ativo define a PERMISSÃO (quais abas)
 * e o ESCOPO DOS DADOS (protocolos/opções carregam `grupo_id`). Admin ignora a
 * permissão de abas (vê todas), mas os dados seguem o grupo ativo.
 */
const COOKIE_GRUPO = "pca_grupo";

export type GrupoResumo = { id: number; nome: string; permissaoId: number | null };

/** Grupos aos quais o usuário pertence (ordenados por nome). */
export async function gruposDoUsuario(usuarioId: number): Promise<GrupoResumo[]> {
  return getDb()
    .select({ id: grupos.id, nome: grupos.nome, permissaoId: grupos.permissaoId })
    .from(usuarioGrupos)
    .innerJoin(grupos, eq(usuarioGrupos.grupoId, grupos.id))
    .where(eq(usuarioGrupos.usuarioId, usuarioId))
    .orderBy(grupos.nome);
}

/** Grupo ativo: cookie validado contra os grupos do usuário; senão o primeiro. */
export async function getGrupoAtivo(usuario?: UsuarioSessao | null): Promise<GrupoResumo | null> {
  const u = usuario ?? (await getUsuarioAtual());
  if (!u) return null;
  const lista = await gruposDoUsuario(u.id);
  if (lista.length === 0) return null;
  const jar = await cookies();
  const escolhido = Number(jar.get(COOKIE_GRUPO)?.value);
  return lista.find((g) => g.id === escolhido) ?? lista[0];
}

/** id do grupo ativo (para escopar consultas). NULL = sem grupo. */
export async function getGrupoAtivoId(usuario?: UsuarioSessao | null): Promise<number | null> {
  return (await getGrupoAtivo(usuario))?.id ?? null;
}

export async function definirGrupoAtivo(grupoId: number): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_GRUPO, String(grupoId), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86_400,
  });
}

/** Abas liberadas para o usuário no grupo ativo. Admin vê todas (regra firme). */
export async function abasPermitidas(
  usuario: UsuarioSessao,
  grupo?: GrupoResumo | null,
): Promise<Set<string>> {
  if (usuario.role === "admin") return new Set(ABAS.map((a) => a.key));
  const g = grupo === undefined ? await getGrupoAtivo(usuario) : grupo;
  if (!g?.permissaoId) return new Set();
  const [p] = await getDb()
    .select({ abas: permissoes.abas })
    .from(permissoes)
    .where(eq(permissoes.id, g.permissaoId))
    .limit(1);
  try {
    const arr: unknown = JSON.parse(p?.abas ?? "[]");
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}
