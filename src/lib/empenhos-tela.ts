import { eq } from "drizzle-orm";
import { centiLotes, empenhos } from "@/db/schema";
import { getDb } from "./db";
import type { AnoEmpenhos } from "./empenhos-tela-core";
import { consultaAnosEmpenhos, consultaVersaoEmpenhos, textoPacoteEmpenhos } from "./empenhos-tela-sql";
import { criarMemoVersao } from "./memo-versao-core";

/**
 * A TELA DE EMPENHOS no D1. O pacote de um ano (~2,4 MB para 21 mil empenhos) fica na MEMÓRIA do Worker enquanto a
 * versão do ano (a última importação promovida) for a mesma — cada leitura completa percorre o ano inteiro; abrir a tela
 * de novo sem importação nova não lê nada além da versão.
 */
const memo = criarMemoVersao({ max: 6, ttlMs: 2 * 60 * 60_000, agora: () => Date.now() });

export function anosEmpenhos(): Promise<AnoEmpenhos[]> {
  return consultaAnosEmpenhos(getDb());
}

/** O pacote do ano como TEXTO JSON; `null` quando uma importação concluída no meio impediu uma leitura consistente. */
export async function pacoteEmpenhos(ano: number, removidos: boolean): Promise<string | null> {
  const db = getDb();
  const ver = await consultaVersaoEmpenhos(db, ano);
  try {
    return await memo.obter(`${ano}:${removidos ? 1 : 0}`, ver, async () => {
      const t = await textoPacoteEmpenhos(db, ano, removidos);
      if (t == null) throw new Error("Os empenhos mudaram durante a leitura.");
      return t;
    });
  } catch {
    return null;
  }
}

export type EmpenhoCompleto = typeof empenhos.$inferSelect & { loteEstado: string | null; loteConcluidoEm: string | null };

/** Um empenho com TUDO (o histórico, a importação que o gravou, o leitor, criado/atualizado/removido). */
export async function empenhoCompleto(id: number): Promise<EmpenhoCompleto | null> {
  const [e] = await getDb()
    .select()
    .from(empenhos)
    .leftJoin(centiLotes, eq(centiLotes.id, empenhos.loteId))
    .where(eq(empenhos.id, id))
    .limit(1);
  return e ? { ...e.empenhos, loteEstado: e.centi_lotes?.estado ?? null, loteConcluidoEm: e.centi_lotes?.concluidoEm ?? null } : null;
}
