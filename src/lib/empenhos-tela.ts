import { eq, inArray } from "drizzle-orm";
import { cache } from "react";
import { centiLotes, empenhos, orgaos, reparticoes } from "@/db/schema";
import { getDb } from "./db";
import { type AnoEmpenhos, chaveOrgaosEmpenhos, gestoresDasSiglas, gestoresSemOrgao, type OrgaosEmpenhos } from "./empenhos-tela-core";
import { consultaAnosEmpenhos, consultaGestoresEmpenhos, consultaVersaoEmpenhos, textoPacoteEmpenhos } from "./empenhos-tela-sql";
import { unidadeDoModulo } from "./escopo-cabecalho";
import { criarMemoVersao } from "./memo-versao-core";

/**
 * A TELA DE EMPENHOS no D1. O pacote de um ano (~2,4 MB para 21 mil empenhos) fica na MEMÓRIA do Worker enquanto a
 * versão do ano (a última importação promovida) for a mesma — cada leitura completa percorre o ano inteiro; abrir a tela
 * de novo sem importação nova não lê nada além da versão.
 */
const memo = criarMemoVersao({ max: 12, ttlMs: 2 * 60 * 60_000, agora: () => Date.now() });

/**
 * Os ÓRGÃOS GESTORES que a pessoa vê (por requisição): a unidade do cabeçalho — ou as unidades que ela acessa, com
 * Empenhos fora do "Filtro da unidade" — vira o ÓRGÃO de cada unidade e, pela SIGLA, os "Órgão gestor" da Centi.
 * `null` = todos (ADM, "Geral"); `[]` = nenhum.
 */
export const orgaosDosEmpenhos = cache(async (): Promise<OrgaosEmpenhos> => {
  const { id } = await unidadeDoModulo("empenhos");
  if (id === null) return null;
  if (id === false) return [];
  const ids = typeof id === "number" ? [id] : [...id];
  if (!ids.length) return [];
  const db = getDb();
  const [siglas, gestores] = await Promise.all([
    db.select({ s: orgaos.sigla }).from(reparticoes).innerJoin(orgaos, eq(orgaos.id, reparticoes.orgaoId)).where(inArray(reparticoes.id, ids.slice(0, 90))),
    consultaGestoresEmpenhos(db),
  ]);
  return gestoresDasSiglas(gestores, siglas.map((r) => r.s));
});

export async function anosEmpenhos(escopo: OrgaosEmpenhos): Promise<AnoEmpenhos[]> {
  return consultaAnosEmpenhos(getDb(), escopo);
}

/** Os "Órgão gestor" da Centi sem órgão cadastrado de mesma sigla (o aviso do ADM — os grupos não os veem). */
export async function gestoresSemCadastro(): Promise<string[]> {
  const db = getDb();
  const [gestores, siglas] = await Promise.all([consultaGestoresEmpenhos(db), db.select({ s: orgaos.sigla }).from(orgaos)]);
  return gestoresSemOrgao(gestores, siglas.map((r) => r.s));
}

/** O pacote do ano como TEXTO JSON; `null` quando uma importação concluída no meio impediu uma leitura consistente. */
export async function pacoteEmpenhos(ano: number, removidos: boolean, escopo: OrgaosEmpenhos): Promise<string | null> {
  const db = getDb();
  const ver = await consultaVersaoEmpenhos(db, ano);
  try {
    return await memo.obter(`${ano}:${removidos ? 1 : 0}:${chaveOrgaosEmpenhos(escopo)}`, ver, async () => {
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
