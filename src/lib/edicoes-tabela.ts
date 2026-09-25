import { and, eq, like, or } from "drizzle-orm";
import { edicoesTabela, usuarios } from "@/db/schema";
import { getDb } from "./db";
import type { EdicaoTabela } from "./edicoes-tabela-core";
import { nomeExibicao } from "./pessoa";

/**
 * EDIÇÕES SALVAS de tabela (migração `0041`) — acesso ao D1 (só escopo de request). O usuário vê as DELE e as PÚBLICAS;
 * só o dono (ou o ADM) atualiza/exclui.
 */
export async function listarEdicoesTabela(usuarioId: number, prefixo: string): Promise<EdicaoTabela[]> {
  const linhas = await getDb()
    .select({
      id: edicoesTabela.id,
      chave: edicoesTabela.chave,
      nome: edicoesTabela.nome,
      valor: edicoesTabela.valor,
      publico: edicoesTabela.publico,
      usuarioId: edicoesTabela.usuarioId,
      autorNome: usuarios.nome,
      autorApelido: usuarios.apelido,
    })
    .from(edicoesTabela)
    .innerJoin(usuarios, eq(usuarios.id, edicoesTabela.usuarioId))
    .where(and(like(edicoesTabela.chave, `${prefixo}%`), or(eq(edicoesTabela.usuarioId, usuarioId), eq(edicoesTabela.publico, true))));
  return linhas.flatMap((l) => {
    try {
      return [
        {
          id: l.id,
          chave: l.chave,
          nome: l.nome,
          publico: l.publico,
          minha: l.usuarioId === usuarioId,
          autor: nomeExibicao({ nome: l.autorNome, apelido: l.autorApelido }),
          valor: JSON.parse(l.valor) as unknown,
        },
      ];
    } catch {
      return []; // valor corrompido: a edição não aparece
    }
  });
}

export async function getEdicaoTabela(id: number) {
  const [e] = await getDb().select({ id: edicoesTabela.id, usuarioId: edicoesTabela.usuarioId }).from(edicoesTabela).where(eq(edicoesTabela.id, id));
  return e ?? null;
}

export async function criarEdicaoTabela(usuarioId: number, d: { chave: string; nome: string; publico: boolean; valor: unknown }): Promise<number> {
  const [e] = await getDb()
    .insert(edicoesTabela)
    .values({ chave: d.chave, nome: d.nome, publico: d.publico, valor: JSON.stringify(d.valor), usuarioId })
    .returning({ id: edicoesTabela.id });
  return e.id;
}

export async function atualizarEdicaoTabela(id: number, d: { nome?: string; publico?: boolean; valor?: unknown }): Promise<void> {
  await getDb()
    .update(edicoesTabela)
    .set({
      ...(d.nome !== undefined ? { nome: d.nome } : {}),
      ...(d.publico !== undefined ? { publico: d.publico } : {}),
      ...(d.valor !== undefined ? { valor: JSON.stringify(d.valor) } : {}),
      atualizadoEm: new Date().toISOString(),
    })
    .where(eq(edicoesTabela.id, id));
}

export async function excluirEdicaoTabela(id: number): Promise<void> {
  await getDb().delete(edicoesTabela).where(eq(edicoesTabela.id, id));
}
