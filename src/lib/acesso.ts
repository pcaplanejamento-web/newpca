import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { grupos, permissoes, usuarioGrupos } from "@/db/schema";
import { abasConhecidas } from "./abas";
import type { AtorPasta } from "./tarefas-core";
import { type VisaoMesa, visaoMesa } from "./mesa-visao-core";
import { getUsuarioAtual, type UsuarioSessao } from "./auth";
import { getDb } from "./db";
import {
  ACOES_PAPEL,
  type AcaoPapel,
  mensagemSemPermissao,
  mensagemTelaFechada,
  PODE_NADA,
  type PodeMesa,
  type PodeTela,
  podeNaTela,
  type Tela,
  telasAbertas,
} from "./papeis-core";

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

/** TODOS os grupos com as telas que cada um libera (Usuários: escolher os grupos da pessoa e o "Ver acesso"). */
export async function todosOsGruposComAbas(): Promise<GrupoAcesso[]> {
  const linhas = await getDb()
    .select({ id: grupos.id, nome: grupos.nome, permissaoId: grupos.permissaoId, abas: permissoes.abas })
    .from(grupos)
    .leftJoin(permissoes, eq(permissoes.id, grupos.permissaoId))
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

/** O MOTIVO da recusa quando a AÇÃO não é permitida na tela (a tela fechada — grupo/papel — ou a ação que o papel não
 * permite); `null` = pode. As rotas respondem 403 com ele (`recusa`) e a MASSA o põe na falha de cada alvo. */
export function motivoRecusa(a: Acesso, tela: Tela, acao: AcaoPapel, grupoId?: number | null): string | null {
  const pode = podeTela(a, tela, grupoId);
  if (pode[acao]) return null;
  return pode.visualizar ? mensagemSemPermissao(tela, acao) : mensagemTelaFechada(tela);
}

/** As ações que a tela CALENDÁRIO também libera nas tarefas de um quadro (a tarefa e os eventos se mexem por ela). */
const PELA_AGENDA: readonly AcaoPapel[] = ["visualizar", "manipular", "excluir"];

/**
 * O que o papel permite nas TAREFAS de um quadro — no GRUPO DO QUADRO (o link de um aviso de outro grupo da pessoa segue
 * valendo): a tela Tarefas; com `pelaAgenda`, também a tela Calendário para ver, mexer e excluir a tarefa e os eventos
 * (a configuração do quadro, a importação e a exportação são só de Tarefas). O Administrador pode tudo.
 */
export function podeNoQuadro(a: Acesso, grupoId: number, pelaAgenda = false): PodeTela {
  const t = podeTela(a, "tarefas", grupoId);
  if (!pelaAgenda || a.u.admin) return t;
  const c = podeTela(a, "calendario", grupoId);
  return Object.freeze(Object.fromEntries(ACOES_PAPEL.map((x) => [x, t[x] || (PELA_AGENDA.includes(x) && c[x])]))) as PodeTela;
}

/** O MOTIVO da recusa nas tarefas de um quadro (o `podeNoQuadro`); `null` = pode. */
export function motivoNoQuadro(a: Acesso, grupoId: number, acao: AcaoPapel, pelaAgenda = false): string | null {
  if (podeNoQuadro(a, grupoId, pelaAgenda)[acao]) return null;
  const t = podeTela(a, "tarefas", grupoId);
  const c = pelaAgenda ? podeTela(a, "calendario", grupoId) : PODE_NADA;
  if (t.visualizar) return mensagemSemPermissao("tarefas", acao);
  if (c.visualizar) return mensagemSemPermissao("calendario", acao);
  return mensagemTelaFechada("tarefas");
}

/** Os GRUPOS em que o papel faz a AÇÃO nas tarefas (`podeNoQuadro`) — `null` = todos (o ADM). As listas de quadros, os
 * destinos de copiar/mover e as buscas de tarefa seguem por grupo. */
export function gruposDeTarefas(a: Acesso, acao: AcaoPapel = "visualizar", pelaAgenda = false): number[] | null {
  if (a.u.admin) return null;
  return a.grupos.filter((g) => podeNoQuadro(a, g.id, pelaAgenda)[acao]).map((g) => g.id);
}

/** Pode LIGAR o quadro ao Trello (e ver os boards da conta): Configurar Tarefas no grupo dele — o PRIVADO, só o dono. */
export function podeLigarTrello(a: Acesso, q: { grupoId: number; privado: boolean; criadoPor: number | null }): boolean {
  const configura = podeNoQuadro(a, q.grupoId).configurar;
  return q.privado && q.criadoPor != null ? q.criadoPor === a.u.id && configura : configura;
}

/** Quem mexe nas PASTAS de quadros (a regra pura `motivoNaoMoverParaPasta`): os grupos em que o papel CONFIGURA Tarefas
 * (a pasta pública) e em que MANIPULA (a privada, do dono) — o ADM, todos. */
export function atorPasta(a: Acesso): AtorPasta {
  if (a.u.admin) return { id: a.u.id, admin: true, configuraEm: null, manipulaEm: null };
  const em = (acao: "configurar" | "manipular") => a.grupos.filter((g) => podeTela(a, "tarefas", g.id)[acao]).map((g) => g.id);
  return { id: a.u.id, configuraEm: em("configurar"), manipulaEm: em("manipular") };
}

/** O que o papel permite nas DUAS Mesas (a do sistema e a do PCA), no grupo ativo — cada recurso segue a sua. */
export function podeMesa(a: Acesso): PodeMesa {
  return { sistema: podeTela(a, "dfd"), pca: podeTela(a, "pca"), vis: visaoDoAcesso(a) };
}

/** Os DETALHES do papel resolvidos para as Mesas (o Administrador = tudo, regra firme). */
export function visaoDoAcesso(a: Acesso): VisaoMesa {
  return visaoMesa(a.u.papel.detalhes, a.u.admin);
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
