import { and, asc, eq } from "drizzle-orm";
import { usuarios } from "@/db/schema";
import { getDb } from "./db";

/**
 * PESSOAS da plataforma para a gestão do protocolo na Mesa: a lista de usuários ATIVOS (id + nome — nada
 * sensível) que alimenta o dropdown "Responsável" e o filtro da Mesa, e a preferência de cada um: o
 * RESPONSÁVEL PADRÃO escolhido automaticamente ao protocolar (Perfil → Protocolação).
 */

export type Pessoa = { id: number; nome: string };

export async function listarPessoas(): Promise<Pessoa[]> {
  return getDb().select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(eq(usuarios.status, "ativo")).orderBy(asc(usuarios.nome));
}

/** A pessoa existe e está ATIVA (só ela pode ser designada responsável). */
export async function pessoaAtiva(id: number): Promise<boolean> {
  const [r] = await getDb()
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.id, id), eq(usuarios.status, "ativo")))
    .limit(1);
  return !!r;
}

/** Responsável padrão do usuário (ou `null`). Ignora quem deixou de estar ativo. */
export async function responsavelPadraoDe(usuarioId: number): Promise<number | null> {
  const [r] = await getDb().select({ id: usuarios.responsavelPadraoId }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
  const alvo = r?.id ?? null;
  return alvo != null && (await pessoaAtiva(alvo)) ? alvo : null;
}

export async function definirResponsavelPadrao(usuarioId: number, alvo: number | null): Promise<void> {
  await getDb().update(usuarios).set({ responsavelPadraoId: alvo }).where(eq(usuarios.id, usuarioId));
}
