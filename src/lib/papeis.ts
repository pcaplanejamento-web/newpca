import { asc, count, eq, sql } from "drizzle-orm";
import { papeis, usuarios } from "@/db/schema";
import { getDb } from "./db";
import { type Capacidades, coerceCapacidades } from "./papeis-core";
import { comandoAtualizarPapel, comandoExcluirPapel, comandoMarcarPadrao, comandosCriarPapel } from "./papeis-sql";

/**
 * PAPÉIS — o cadastro (Configurações → Papéis, só o ADM) sobre o D1 (só escopo de request). As travas moram nos comandos
 * (`papeis-sql.ts`, testados no driver D1 real); aqui ficam as leituras e o MOTIVO de cada recusa.
 */

export type PapelCadastro = {
  id: number;
  nome: string;
  descricao: string | null;
  /** admin | gestor | membro nos papéis do SISTEMA; `null` nos criados pelo ADM. */
  chave: string | null;
  capacidades: Capacidades;
  padraoCadastro: boolean;
  ordem: number;
  /** Quantas pessoas têm o papel (todas; `ativas` = só as ativas). */
  pessoas: number;
  ativas: number;
};

const lerCapacidades = (json: string): Capacidades => {
  try {
    return coerceCapacidades(JSON.parse(json));
  } catch {
    return {};
  }
};

/** Os papéis, na ordem (o Administrador primeiro), com quantas pessoas têm cada um. */
export async function listarPapeis(): Promise<PapelCadastro[]> {
  const db = getDb();
  const [linhas, usos] = await Promise.all([
    db.select().from(papeis).orderBy(asc(papeis.ordem), asc(papeis.id)),
    db
      .select({ papelId: usuarios.papelId, pessoas: count(), ativas: sql<number>`SUM(CASE WHEN ${usuarios.status} = 'ativo' THEN 1 ELSE 0 END)` })
      .from(usuarios)
      .groupBy(usuarios.papelId),
  ]);
  const uso = new Map(usos.map((u) => [u.papelId, u]));
  return linhas.map((p) => ({
    id: p.id,
    nome: p.nome,
    descricao: p.descricao,
    chave: p.chave,
    capacidades: lerCapacidades(p.capacidades),
    padraoCadastro: p.padraoCadastro,
    ordem: p.ordem,
    pessoas: uso.get(p.id)?.pessoas ?? 0,
    ativas: Number(uso.get(p.id)?.ativas ?? 0),
  }));
}

/** Um papel (com as pessoas) — `null` se não existe. */
export async function getPapel(id: number): Promise<PapelCadastro | null> {
  return (await listarPapeis()).find((p) => p.id === id) ?? null;
}

/** O nome já é de OUTRO papel (sem caixa nem espaços nas pontas)? */
export async function nomePapelEmUso(nome: string, exceto?: number): Promise<boolean> {
  const alvo = nome.trim().toLocaleLowerCase("pt-BR");
  return (await getDb().select({ id: papeis.id, nome: papeis.nome }).from(papeis)).some((p) => p.id !== exceto && p.nome.trim().toLocaleLowerCase("pt-BR") === alvo);
}

/** O erro do índice único do NOME (dois papéis com o mesmo nome gravados ao mesmo tempo) — a rota responde 409. */
export function nomeDuplicado(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.message} ${e.cause instanceof Error ? e.cause.message : ""}` : String(e);
  return /UNIQUE constraint failed: papeis\.nome/i.test(msg);
}

/** Cria o papel (no fim da ordem); `padraoCadastro` = vira o padrão dos novos cadastros. Devolve o id. */
export async function criarPapel(d: { nome: string; descricao: string | null; capacidades: Capacidades; padraoCadastro: boolean }): Promise<number> {
  const db = getDb();
  const cmds = comandosCriarPapel(db, { ...d, capacidades: JSON.stringify(d.capacidades) });
  const [[novo]] = (await db.batch(cmds as unknown as Parameters<typeof db.batch>[0])) as unknown as [{ id: number }[]];
  return novo.id;
}

/**
 * Altera o papel. `padraoCadastro: true` = vira o padrão (o anterior deixa de ser, no mesmo comando). O motivo da recusa:
 * o Administrador é fixo; o padrão só troca marcando OUTRO (sempre há um).
 */
export async function atualizarPapel(
  atual: PapelCadastro,
  d: { nome?: string; descricao?: string | null; capacidades?: Capacidades; padraoCadastro?: boolean },
): Promise<string | null> {
  if (atual.chave === "admin") return "O papel Administrador é fixo: tem acesso a tudo, inclusive à Administração.";
  if (d.padraoCadastro === false && atual.padraoCadastro) return "Há sempre um papel padrão dos novos cadastros — marque outro papel como padrão.";
  const db = getDb();
  const campos = {
    ...(d.nome !== undefined ? { nome: d.nome } : {}),
    ...(d.descricao !== undefined ? { descricao: d.descricao } : {}),
    ...(d.capacidades !== undefined ? { capacidades: JSON.stringify(d.capacidades) } : {}),
  };
  const cmds = [comandoAtualizarPapel(db, atual.id, campos), ...(d.padraoCadastro && !atual.padraoCadastro ? [comandoMarcarPadrao(db, atual.id)] : [])];
  await db.batch(cmds as unknown as Parameters<typeof db.batch>[0]);
  return null;
}

/** Exclui o papel — o motivo quando não pode (do sistema, o padrão, em uso). `null` = excluído. */
export async function excluirPapel(atual: PapelCadastro): Promise<string | null> {
  if (atual.chave) return "Papel do sistema não se exclui (pode ser editado).";
  if (atual.padraoCadastro) return "É o papel dos novos cadastros — marque outro papel como padrão antes de excluir.";
  if (atual.pessoas > 0) return `${atual.pessoas} ${atual.pessoas === 1 ? "pessoa tem" : "pessoas têm"} este papel — troque o papel delas em Usuários antes de excluir.`;
  const r = await comandoExcluirPapel(getDb(), atual.id);
  return r.length ? null : "O papel passou a ser usado agora há pouco — recarregue e tente de novo.";
}

/** Um papel oferecido na tela de Usuários (a troca, a aprovação e o "Ver acesso"). */
export type OpcaoPapel = { id: number; nome: string; descricao: string | null; chave: string | null; padraoCadastro: boolean; capacidades: Capacidades };

/** Os papéis da tela de Usuários, na ordem do cadastro (o Administrador primeiro). */
export async function opcoesPapel(): Promise<OpcaoPapel[]> {
  const linhas = await getDb()
    .select({ id: papeis.id, nome: papeis.nome, descricao: papeis.descricao, chave: papeis.chave, padraoCadastro: papeis.padraoCadastro, capacidades: papeis.capacidades })
    .from(papeis)
    .orderBy(asc(papeis.ordem), asc(papeis.id));
  return linhas.map((p) => ({ ...p, capacidades: lerCapacidades(p.capacidades) }));
}

/** O papel pelo id (nome + chave — a troca de papel de um usuário confere antes); `null` = não existe. */
export async function papelPorId(id: number): Promise<{ id: number; nome: string; chave: string | null } | null> {
  const [p] = await getDb().select({ id: papeis.id, nome: papeis.nome, chave: papeis.chave }).from(papeis).where(eq(papeis.id, id)).limit(1);
  return p ?? null;
}
