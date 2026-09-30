import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { grupoReparticoes, grupos, permissoes, reparticoes, usuarioGrupos } from "@/db/schema";
import { ABAS, abasConhecidas } from "./abas";
import { getUsuarioAtual, type UsuarioSessao } from "./auth";
import { getDb } from "./db";
import {
  type EscopoUnidades,
  ESCOPO_NENHUMA,
  escopoDeAcesso,
  FILTRO_NENHUMA,
  type FiltroLista,
  filtroDeLista,
  unidadeNoEscopo,
} from "./escopo-unidades-core";

/**
 * RBAC por grupo. Um usuário pode estar em vários grupos e escolhe o ativo no
 * cabeçalho (cookie `pca_grupo`). O grupo ativo define a PERMISSÃO (quais abas de
 * módulo) e as UNIDADES acessíveis (`grupo_reparticoes`) — que escopam os dados da
 * Mesa e do PCA. Admin ignora a permissão de abas e acessa todas as unidades.
 */
const COOKIE_GRUPO = "pca_grupo";
const COOKIE_REP = "pca_reparticao";

export type GrupoResumo = { id: number; nome: string; permissaoId: number | null };
export type ReparticaoResumo = { id: number; codigo: string; nome: string };

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
  if (usuario.admin) return new Set(ABAS.map((a) => a.key));
  const g = grupo === undefined ? await getGrupoAtivo(usuario) : grupo;
  if (!g?.permissaoId) return new Set();
  const [p] = await getDb()
    .select({ abas: permissoes.abas })
    .from(permissoes)
    .where(eq(permissoes.id, g.permissaoId))
    .limit(1);
  try {
    return new Set(abasConhecidas(JSON.parse(p?.abas ?? "[]"))); // chaves de módulos removidos não valem
  } catch {
    return new Set();
  }
}

/** Repartições que um grupo acessa (ordenadas pela ordem da tela de repartições). */
export async function reparticoesDoGrupo(grupoId: number): Promise<ReparticaoResumo[]> {
  return getDb()
    .select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome })
    .from(grupoReparticoes)
    .innerJoin(reparticoes, eq(grupoReparticoes.reparticaoId, reparticoes.id))
    .where(eq(grupoReparticoes.grupoId, grupoId))
    .orderBy(asc(reparticoes.ordem), asc(reparticoes.id));
}

/** Todas as repartições (ordenadas) — o ADM vê todas no head. */
export async function listarReparticoes(): Promise<ReparticaoResumo[]> {
  return getDb()
    .select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome })
    .from(reparticoes)
    .orderBy(asc(reparticoes.ordem), asc(reparticoes.id));
}

/**
 * Contexto de repartição do cabeçalho. **Admin vê TODAS** (regra firme); os demais
 * veem só as do grupo ativo (incluindo/excluindo "Geral" conforme o grupo). A ativa
 * vem do cookie, validada contra a lista.
 */
export async function getReparticaoContexto(
  usuario?: UsuarioSessao | null,
  grupoAtivo?: GrupoResumo | null,
): Promise<{ lista: ReparticaoResumo[]; ativa: ReparticaoResumo | null }> {
  const u = usuario === undefined ? await getUsuarioAtual() : usuario;
  let lista: ReparticaoResumo[];
  if (u?.admin) {
    lista = await listarReparticoes();
  } else {
    const grupo = grupoAtivo === undefined ? await getGrupoAtivo(u) : grupoAtivo;
    if (!grupo) return { lista: [], ativa: null };
    lista = await reparticoesDoGrupo(grupo.id);
  }
  if (lista.length === 0) return { lista, ativa: null };
  const jar = await cookies();
  const escolhida = Number(jar.get(COOKIE_REP)?.value);
  return { lista, ativa: lista.find((r) => r.id === escolhida) ?? lista[0] };
}

export type UnidadesDaSessao = {
  /** As unidades do grupo ativo (o ADM: todas) — o seletor do cabeçalho. */
  lista: ReparticaoResumo[];
  /** A unidade ATIVA do cabeçalho. */
  ativa: ReparticaoResumo | null;
  /** O ESCOPO de acesso (detalhe e escrita): todas (ADM ou a "Geral" no grupo) · as do grupo · nenhuma. */
  escopo: EscopoUnidades;
  /** O filtro das LISTAS (a unidade ativa): todas · uma · nenhuma (sem grupo/unidade — a lista fica vazia). */
  filtro: FiltroLista;
  /** O registro está no escopo de acesso? (o sem unidade fica com quem tem alguma unidade). */
  acessivel: (reparticaoId: number | null | undefined) => boolean;
};

/**
 * As UNIDADES da sessão numa chamada (antes, "sem unidade" virava `null` = sem filtro: quem não tinha grupo via a Mesa
 * inteira, e a "Geral" valia na lista mas era recusada no detalhe).
 */
export async function unidadesDaSessao(usuario?: UsuarioSessao | null, grupoAtivo?: GrupoResumo | null): Promise<UnidadesDaSessao> {
  const u = usuario === undefined ? await getUsuarioAtual() : usuario;
  if (!u) return { lista: [], ativa: null, escopo: ESCOPO_NENHUMA, filtro: FILTRO_NENHUMA, acessivel: () => false };
  const { lista, ativa } = await getReparticaoContexto(u, grupoAtivo);
  const escopo = escopoDeAcesso(u.admin, lista);
  return { lista, ativa, escopo, filtro: filtroDeLista(u.admin, ativa), acessivel: (rid) => unidadeNoEscopo(escopo, rid) };
}

/** As unidades que a pessoa ACESSA, para os banners (conferência e escolha): com o escopo "todas" (o ADM ou a "Geral"),
 * todas as cadastradas; senão as do grupo. */
export async function unidadesAcessiveis(un: UnidadesDaSessao): Promise<ReparticaoResumo[]> {
  return un.escopo.tipo === "todas" ? listarReparticoes() : un.lista;
}

export async function definirReparticaoAtiva(reparticaoId: number): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_REP, String(reparticaoId), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86_400,
  });
}
