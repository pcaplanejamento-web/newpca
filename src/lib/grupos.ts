import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { grupoReparticoes, grupos, reparticoes, usuarioGrupos, usuarioReparticoes, usuarios } from "@/db/schema";
import { getUsuarioAtual, type UsuarioSessao } from "./auth";
import { getDb } from "./db";
import {
  type EscopoUnidades,
  ESCOPO_NENHUMA,
  escopoDeAcesso,
  FILTRO_NENHUMA,
  type FiltroLista,
  filtroDeLista,
  lerEscopoTelas,
  type ModoUnidades,
  telasComTodas,
  telaVeTodas,
  unidadeNoEscopo,
  unidadesDoMembro,
  ID_MINHAS_UNIDADES,
  listaComGeral,
  chaveFonte,
  filtroDoEscopo,
  lerFontesAbas,
} from "./escopo-unidades-core";

/**
 * RBAC por grupo. Um usuário pode estar em vários grupos e escolhe o ativo no
 * cabeçalho (cookie `pca_grupo`). O grupo ativo define as TELAS (quais telas — o que se faz
 * nelas é do PAPEL: `acesso.ts`) e as UNIDADES acessíveis (`grupo_reparticoes`) — que escopam
 * os dados da Mesa e do PCA. O Administrador abre todas as telas e acessa todas as unidades.
 */
const COOKIE_GRUPO = "pca_grupo";
const COOKIE_REP = "pca_reparticao";

export type GrupoResumo = { id: number; nome: string; modoUnidades?: ModoUnidades; escopoTelas?: string | null; fontesAbas?: string | null };
export type ReparticaoResumo = { id: number; codigo: string; nome: string };

/** Grupos aos quais o usuário pertence (ordenados por nome). */
export const gruposDoUsuario = cache(async (usuarioId: number): Promise<GrupoResumo[]> =>
  getDb()
    .select({ id: grupos.id, nome: grupos.nome, modoUnidades: grupos.modoUnidades, escopoTelas: grupos.escopoTelas, fontesAbas: grupos.fontesAbas })
    .from(usuarioGrupos)
    .innerJoin(grupos, eq(usuarioGrupos.grupoId, grupos.id))
    .where(eq(usuarioGrupos.usuarioId, usuarioId))
    .orderBy(grupos.nome),
);

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

/** Repartições que um grupo acessa (ordenadas pela ordem da tela de repartições). */
export async function reparticoesDoGrupo(grupoId: number): Promise<ReparticaoResumo[]> {
  return getDb()
    .select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome })
    .from(grupoReparticoes)
    .innerJoin(reparticoes, eq(grupoReparticoes.reparticaoId, reparticoes.id))
    .where(eq(grupoReparticoes.grupoId, grupoId))
    .orderBy(asc(reparticoes.ordem), asc(reparticoes.id));
}

/** As unidades de CADASTRO da pessoa — a principal (`usuarios.reparticao_id`) primeiro e as adicionais
 * (`usuario_reparticoes`) na ordem da tela de unidades — o grupo no modo `cadastro`. */
export async function unidadesDeCadastro(usuarioId: number): Promise<ReparticaoResumo[]> {
  const db = getDb();
  const cols = { id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome };
  const [principal, extras] = await Promise.all([
    db.select(cols).from(usuarios).innerJoin(reparticoes, eq(usuarios.reparticaoId, reparticoes.id)).where(eq(usuarios.id, usuarioId)).limit(1),
    db
      .select(cols)
      .from(usuarioReparticoes)
      .innerJoin(reparticoes, eq(usuarioReparticoes.reparticaoId, reparticoes.id))
      .where(eq(usuarioReparticoes.usuarioId, usuarioId))
      .orderBy(asc(reparticoes.ordem), asc(reparticoes.id)),
  ]);
  return [...principal, ...extras];
}

/**
 * As unidades de um MEMBRO no grupo: as escolhidas (modo `lista`) ou as unidades de cadastro dele (modo `cadastro`). No
 * modo `cadastro`, a TELA marcada "todas" pelo ADM dá todas as unidades (a "Geral" junto — escopo todas).
 */
export async function reparticoesDoMembro(grupo: GrupoResumo, usuarioId: number, tela?: string | null): Promise<ReparticaoResumo[]> {
  let modo = grupo.modoUnidades;
  let escopoTelas = grupo.escopoTelas;
  if (!modo || escopoTelas === undefined) {
    const [g] = await getDb().select({ m: grupos.modoUnidades, e: grupos.escopoTelas }).from(grupos).where(eq(grupos.id, grupo.id)).limit(1);
    modo = g?.m ?? "lista";
    escopoTelas = g?.e ?? null;
  }
  if (modo === "cadastro") {
    if (telaVeTodas(modo, lerEscopoTelas(escopoTelas), tela)) return listarReparticoes();
    return unidadesDoMembro(modo, [], await unidadesDeCadastro(usuarioId));
  }
  return reparticoesDoGrupo(grupo.id);
}

/** Todas as repartições (ordenadas) — o ADM vê todas no head. Memorizada POR REQUISIÇÃO (`cache` do React): o
 * cabeçalho, o escopo e os banners da Mesa leem a mesma lista uma vez só. Quem usa só lê (não altere a lista). */
export const listarReparticoes = cache(async (): Promise<ReparticaoResumo[]> => {
  return getDb()
    .select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome })
    .from(reparticoes)
    .orderBy(asc(reparticoes.ordem), asc(reparticoes.id));
});

/**
 * Contexto de repartição do cabeçalho. **Admin vê TODAS** (regra firme); os demais
 * veem só as do grupo ativo (incluindo/excluindo "Geral" conforme o grupo). A ativa
 * vem do cookie, validada contra a lista.
 */
export async function getReparticaoContexto(
  usuario?: UsuarioSessao | null,
  grupoAtivo?: GrupoResumo | null,
  tela?: string | null,
): Promise<{ lista: ReparticaoResumo[]; ativa: ReparticaoResumo | null }> {
  const u = usuario === undefined ? await getUsuarioAtual() : usuario;
  let lista: ReparticaoResumo[];
  if (u?.admin) {
    lista = await listarReparticoes();
  } else {
    const grupo = grupoAtivo === undefined ? await getGrupoAtivo(u) : grupoAtivo;
    if (!grupo || !u) return { lista: [], ativa: null };
    lista = await reparticoesDoMembro(grupo, u.id, tela);
  }
  if (lista.length === 0) return { lista, ativa: null };
  lista = listaComGeral(!!u?.admin, lista);
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
export async function unidadesDaSessao(
  usuario?: UsuarioSessao | null,
  grupoAtivo?: GrupoResumo | null,
  /** A TELA dos dados (a chave de `ABAS`): no grupo de "unidade de cadastro", a tela marcada "todas" vê todas. */
  tela?: string | null,
  /** A ABA da tela: no grupo que a pôs em "fonte única", os dados são a soma de todas as unidades da pessoa. */
  aba?: string | null,
): Promise<UnidadesDaSessao> {
  const u = usuario === undefined ? await getUsuarioAtual() : usuario;
  if (!u) return { lista: [], ativa: null, escopo: ESCOPO_NENHUMA, filtro: FILTRO_NENHUMA, acessivel: () => false };
  const { lista, ativa } = await getReparticaoContexto(u, grupoAtivo, tela);
  const reais = lista.filter((r) => r.id !== ID_MINHAS_UNIDADES);
  const escopo = escopoDeAcesso(u.admin, reais);
  const grupo = grupoAtivo && "fontesAbas" in grupoAtivo ? grupoAtivo : await getGrupoAtivo(u);
  const chave = chaveFonte(tela, aba);
  const unica = !!chave && lerFontesAbas(grupo?.fontesAbas).includes(chave);
  return { lista, ativa, escopo, filtro: unica ? filtroDoEscopo(escopo) : filtroDeLista(u.admin, ativa, reais), acessivel: (rid) => unidadeNoEscopo(escopo, rid) };
}

/** As unidades que a pessoa ACESSA, para os banners (conferência e escolha): com o escopo "todas" (o ADM ou a "Geral"),
 * todas as cadastradas; senão as do grupo. */
export async function unidadesAcessiveis(un: UnidadesDaSessao): Promise<ReparticaoResumo[]> {
  return un.escopo.tipo === "todas" ? listarReparticoes() : un.lista.filter((r) => r.id !== ID_MINHAS_UNIDADES);
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

/** As telas em que o grupo (no modo "unidade de cadastro") vê TODAS as unidades — o cabeçalho troca a lista nelas. */
export async function telasTodasDoGrupo(grupoId: number): Promise<string[]> {
  const [g] = await getDb().select({ m: grupos.modoUnidades, e: grupos.escopoTelas }).from(grupos).where(eq(grupos.id, grupoId)).limit(1);
  return g ? telasComTodas(g.m, lerEscopoTelas(g.e)) : [];
}
