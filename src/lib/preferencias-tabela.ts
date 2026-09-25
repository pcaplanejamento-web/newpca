import { and, eq, like } from "drizzle-orm";
import { preferenciasTabela } from "@/db/schema";
import { getDb } from "./db";

/**
 * AJUSTES SALVOS de tabela por usuário (migração `0040`) — `{chave: valor}` (o JSON cru; quem usa normaliza, ex.:
 * `coerceLayout`). Só escopo de request (`getDb`).
 */
export async function listarPreferenciasTabela(usuarioId: number, prefixo: string): Promise<Record<string, unknown>> {
  const linhas = await getDb()
    .select({ chave: preferenciasTabela.chave, valor: preferenciasTabela.valor })
    .from(preferenciasTabela)
    .where(and(eq(preferenciasTabela.usuarioId, usuarioId), like(preferenciasTabela.chave, `${prefixo}%`)));
  const out: Record<string, unknown> = {};
  for (const l of linhas) {
    try {
      out[l.chave] = JSON.parse(l.valor);
    } catch {
      // valor corrompido: como se não houvesse (a tabela abre no padrão)
    }
  }
  return out;
}

export async function salvarPreferenciaTabela(usuarioId: number, chave: string, valor: unknown): Promise<void> {
  const json = JSON.stringify(valor);
  const agora = new Date().toISOString();
  await getDb()
    .insert(preferenciasTabela)
    .values({ usuarioId, chave, valor: json, atualizadoEm: agora })
    .onConflictDoUpdate({ target: [preferenciasTabela.usuarioId, preferenciasTabela.chave], set: { valor: json, atualizadoEm: agora } });
}

export async function excluirPreferenciaTabela(usuarioId: number, chave: string): Promise<void> {
  await getDb()
    .delete(preferenciasTabela)
    .where(and(eq(preferenciasTabela.usuarioId, usuarioId), eq(preferenciasTabela.chave, chave)));
}
