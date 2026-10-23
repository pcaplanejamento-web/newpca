import { eq, inArray } from "drizzle-orm";
import { cache } from "react";
import { centiLotes, empenhos, reparticoes } from "@/db/schema";
import { getDb } from "./db";
import { type AnoEmpenhos, chaveEscopoEmpenhos, type EscopoEmpenhos } from "./empenhos-tela-core";
import { consultaAnosEmpenhos, consultaVersaoEmpenhos, textoPacoteEmpenhos } from "./empenhos-tela-sql";
import { unidadeDoModulo } from "./escopo-cabecalho";
import { criarMemoVersao } from "./memo-versao-core";

/**
 * A TELA DE EMPENHOS no D1. O pacote de um ano (~2,4 MB para 21 mil empenhos) fica na MEMÓRIA do Worker enquanto a
 * versão do ano (a última importação promovida) for a mesma — cada leitura completa percorre o ano inteiro; abrir a tela
 * de novo sem importação nova não lê nada além da versão.
 */
const memo = criarMemoVersao({ max: 12, ttlMs: 2 * 60 * 60_000, agora: () => Date.now() });

/**
 * O ESCOPO dos empenhos da pessoa (por requisição): a unidade do cabeçalho — ou as unidades que ela acessa, com Empenhos
 * fora do "Filtro da unidade" — e os ÓRGÃOS dessas unidades (para o empenho vinculado só ao órgão). `null` = todos.
 */
export const escopoDosEmpenhos = cache(async (): Promise<EscopoEmpenhos> => {
  const { id } = await unidadeDoModulo("empenhos");
  if (id === null) return null;
  if (id === false) return { unidades: [], orgaos: [] };
  const ids = typeof id === "number" ? [id] : [...id];
  if (!ids.length) return { unidades: [], orgaos: [] };
  const l = await getDb()
    .select({ id: reparticoes.id, orgaoId: reparticoes.orgaoId })
    .from(reparticoes)
    .where(inArray(reparticoes.id, ids.slice(0, 90)));
  return { unidades: l.map((r) => r.id), orgaos: [...new Set(l.map((r) => r.orgaoId).filter((o): o is number => o != null))] };
});

export async function anosEmpenhos(escopo: EscopoEmpenhos): Promise<AnoEmpenhos[]> {
  return consultaAnosEmpenhos(getDb(), escopo);
}

/** O pacote do ano como TEXTO JSON; `null` quando uma importação concluída no meio impediu uma leitura consistente. */
export async function pacoteEmpenhos(ano: number, removidos: boolean, escopo: EscopoEmpenhos): Promise<string | null> {
  const db = getDb();
  const ver = await consultaVersaoEmpenhos(db, ano);
  try {
    return await memo.obter(`${ano}:${removidos ? 1 : 0}:${chaveEscopoEmpenhos(escopo)}`, ver, async () => {
      const t = await textoPacoteEmpenhos(db, ano, removidos, escopo);
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
