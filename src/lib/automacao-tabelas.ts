import { eq } from "drizzle-orm";
import { automacaoTabelas } from "@/db/schema";
import { getDb } from "./db";
import type { Item } from "./fluxo-core";
import { chaveTabela, linhasParaTabela, MAX_NOME_TABELA } from "./fluxo-dados";

export type ResumoTabela = { id: number; nome: string; total: number; colunas: string[]; atualizadoEm: string | null };
export type TabelaSalva = ResumoTabela & { linhas: Item[] };

const json = <T>(t: string, padrao: T): T => {
  try {
    const v = JSON.parse(t);
    return Array.isArray(v) ? (v as T) : padrao;
  } catch {
    return padrao;
  }
};

/** As tabelas salvas (sem as linhas). */
export async function listarTabelas(): Promise<ResumoTabela[]> {
  const ls = await getDb()
    .select({ id: automacaoTabelas.id, nome: automacaoTabelas.nome, total: automacaoTabelas.total, colunas: automacaoTabelas.colunas, atualizadoEm: automacaoTabelas.atualizadoEm })
    .from(automacaoTabelas)
    .orderBy(automacaoTabelas.nome);
  return ls.map((l) => ({ ...l, colunas: json<string[]>(l.colunas, []) }));
}

/** Uma tabela pelo NOME (sem caixa/acento), com as linhas. */
export async function lerTabela(nome: string): Promise<TabelaSalva | null> {
  const l = (await getDb().select().from(automacaoTabelas).where(eq(automacaoTabelas.chave, chaveTabela(nome))))[0];
  return l ? { id: l.id, nome: l.nome, total: l.total, colunas: json<string[]>(l.colunas, []), atualizadoEm: l.atualizadoEm, linhas: json<Item[]>(l.linhas, []) } : null;
}

/** Grava a tabela: SUBSTITUI as linhas ou ACRESCENTA às que já há (o teto de linhas/bytes vale para o total). */
export async function gravarTabela(nome: string, itens: Item[], modo: "substituir" | "acrescentar", usuarioId: number) {
  const chave = chaveTabela(nome);
  const antes = modo === "acrescentar" ? ((await lerTabela(nome))?.linhas ?? []) : [];
  const { linhas, colunas, cortadas } = linhasParaTabela([...antes, ...itens]);
  const valores = { nome: nome.trim().slice(0, MAX_NOME_TABELA), colunas: JSON.stringify(colunas), linhas: JSON.stringify(linhas), total: linhas.length, atualizadoPor: usuarioId };
  await getDb()
    .insert(automacaoTabelas)
    .values({ chave, ...valores })
    .onConflictDoUpdate({ target: automacaoTabelas.chave, set: { ...valores, atualizadoEm: new Date().toISOString() } });
  return { total: linhas.length, colunas, cortadas };
}

export async function excluirTabela(nome: string) {
  const r = await getDb().delete(automacaoTabelas).where(eq(automacaoTabelas.chave, chaveTabela(nome))).returning({ id: automacaoTabelas.id });
  return r.length > 0;
}
