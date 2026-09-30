import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { grupos, permissoes, usuarioGrupos } from "@/db/schema";
import { abasConhecidas } from "./abas";
import { getUsuarioAtual, type UsuarioSessao } from "./auth";
import { getDb } from "./db";
import { PODE_NADA, type PodeTela, podeNaTela, type Tela, telasAbertas } from "./papeis-core";

/**
 * ACESSO EFETIVO de quem está logado: o GRUPO (a permissão dele) libera as telas e o PAPEL diz o que se faz nelas —
 * `podeNaTela` do núcleo puro. Uma consulta para os grupos + as permissões (antes eram três: grupos, grupo ativo e
 * abas), memorizada POR REQUISIÇÃO (`cache` do React): o layout, a página e as rotas leem o mesmo.
 *
 * O grupo ATIVO (cookie `pca_grupo`, validado contra os grupos da pessoa) decide as telas das páginas e das listas; um
 * recurso de OUTRO grupo da pessoa (o quadro de tarefas de outro grupo, aberto por um aviso) é conferido pelo grupo
 * dele (`podeTela(acesso, tela, grupoId)`). O Administrador pode tudo, com ou sem grupo (regra firme).
 */

const COOKIE_GRUPO = "pca_grupo";

export type GrupoAcesso = { id: number; nome: string; permissaoId: number | null; abas: Tela[] };

export type Acesso = {
  u: UsuarioSessao;
  grupos: GrupoAcesso[];
  grupoAtivo: GrupoAcesso | null;
  /** As telas que a pessoa ABRE no grupo ativo, na ordem da navegação (ADM = todas). */
  telas: Tela[];
};

function lerAbas(json: string | null): Tela[] {
  try {
    return abasConhecidas(JSON.parse(json ?? "[]"));
  } catch {
    return [];
  }
}

/** Os grupos da pessoa com as telas que cada um libera (ordenados pelo nome). */
export async function gruposComAbas(usuarioId: number): Promise<GrupoAcesso[]> {
  const linhas = await getDb()
    .select({ id: grupos.id, nome: grupos.nome, permissaoId: grupos.permissaoId, abas: permissoes.abas })
    .from(usuarioGrupos)
    .innerJoin(grupos, eq(usuarioGrupos.grupoId, grupos.id))
    .leftJoin(permissoes, eq(permissoes.id, grupos.permissaoId))
    .where(eq(usuarioGrupos.usuarioId, usuarioId))
    .orderBy(grupos.nome);
  return linhas.map((g) => ({ id: g.id, nome: g.nome, permissaoId: g.permissaoId, abas: lerAbas(g.abas) }));
}

/** O acesso de uma pessoa num grupo ativo escolhido (sem cookie — o feed .ics, o cron). */
export function montarAcesso(u: UsuarioSessao, lista: GrupoAcesso[], grupoAtivoId: number | null): Acesso {
  const grupoAtivo = lista.find((g) => g.id === grupoAtivoId) ?? lista[0] ?? null;
  const telas = telasAbertas({ admin: u.admin, capacidades: u.papel.capacidades, abas: grupoAtivo?.abas ?? [] });
  return { u, grupos: lista, grupoAtivo, telas };
}

/** O acesso de quem está logado (ou `null`) — memorizado por requisição. */
export const getAcesso = cache(async (): Promise<Acesso | null> => {
  const u = await getUsuarioAtual();
  if (!u) return null;
  const [lista, jar] = await Promise.all([gruposComAbas(u.id), cookies()]);
  return montarAcesso(u, lista, Number(jar.get(COOKIE_GRUPO)?.value) || null);
});

/**
 * O que a pessoa pode na tela: no grupo ATIVO ou, com `grupoId`, no grupo do RECURSO (precisa ser um dos grupos dela).
 * O Administrador pode tudo.
 */
export function podeTela(a: Acesso, tela: Tela, grupoId?: number | null): PodeTela {
  if (a.u.admin) return podeNaTela({ admin: true, capacidades: {}, abas: [] }, tela);
  const grupo = grupoId == null ? a.grupoAtivo : a.grupos.find((g) => g.id === grupoId);
  if (!grupo) return PODE_NADA;
  return podeNaTela({ admin: false, capacidades: a.u.papel.capacidades, abas: grupo.abas }, tela);
}

/** Os grupos da pessoa em que a tela ABRE (os quadros de tarefas, o calendário e os avisos seguem por grupo). `null` =
 * o Administrador (todos). */
export function gruposComTela(a: Acesso, tela: Tela): number[] | null {
  if (a.u.admin) return null;
  return a.grupos.filter((g) => podeTela(a, tela, g.id).visualizar).map((g) => g.id);
}

/** A consulta do PCA em PREVIEW (ainda não publicado): só quem está logado e VISUALIZA o PCA (o grupo ativo libera e o
 * papel visualiza — o ADM sempre). O publicado é de qualquer visitante. */
export async function vePreviaPca(): Promise<boolean> {
  const a = await getAcesso();
  return !!a && podeTela(a, "pca").visualizar;
}
