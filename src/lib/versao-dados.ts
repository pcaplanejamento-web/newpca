import { sql } from "drizzle-orm";
import { cache } from "react";
import { auditoria, dfdItens, itens, orcamentoItens } from "@/db/schema";
import { getDb } from "./db";
import { criarMemoVersao } from "./memo-versao-core";
import { FORA_DOS_DADOS, type VersoesDados } from "./versao-dados-core";

/**
 * VERSÃO DOS DADOS — o sinal de "há dado novo" do sistema inteiro, numa consulta barata: toda escrita passa por
 * `registrarAuditoria` (a `auditoria` é APPEND-ONLY) e os LOTES de itens (DFD, orçamento e planilha do PCA), gravados
 * depois do registro do início, sobem o id máximo deles. Duas camadas (`versao-dados-core.ts`): `completa` = toda escrita;
 * `dados` = sem tarefas/agenda (a das telas de Mesa, PCA, Orçamento, Catálogo e Verificação e do `memoPorVersao`).
 * Memorizada por requisição. Usada pelo `SincronizarDados` (o navegador só recarrega quando a versão da tela muda).
 */
const FORA = sql.join(
  FORA_DOS_DADOS.map((e) => sql`${e}`),
  sql`, `,
);

export const versaoDados = cache(async (): Promise<VersoesDados> => {
  const [r] = await getDb()
    .select({
      // Só o que muda DADO: login/logout e a sessão não invalidam as cargas nem o cache das telas.
      a: sql<number | null>`MAX(CASE WHEN ${auditoria.acao} NOT IN ('login', 'logout') AND ${auditoria.entidade} <> 'sessao' THEN ${auditoria.id} END)`,
      d: sql<number | null>`MAX(CASE WHEN ${auditoria.acao} NOT IN ('login', 'logout') AND ${auditoria.entidade} <> 'sessao' AND ${auditoria.entidade} NOT IN (${FORA}) THEN ${auditoria.id} END)`,
      i: sql<number | null>`(SELECT MAX(${dfdItens.id}) FROM ${dfdItens})`,
      o: sql<number | null>`(SELECT MAX(${orcamentoItens.id}) FROM ${orcamentoItens})`,
      p: sql<number | null>`(SELECT MAX(${itens.id}) FROM ${itens})`,
    })
    .from(auditoria);
  const lotes = `${r?.i ?? 0}.${r?.o ?? 0}.${r?.p ?? 0}`;
  return { completa: `${r?.a ?? 0}.${lotes}`, dados: `${r?.d ?? 0}.${lotes}` };
});

const memo = criarMemoVersao({ max: 60, ttlMs: 5 * 60_000, agora: () => Date.now() });

/**
 * O resultado de uma CARGA PESADA (só dados — a chave leva os argumentos, nunca o usuário) guardado na memória do Worker
 * enquanto a versão `dados` for a mesma (validade de segurança de 5 min). O valor é COMPARTILHADO: quem usa só lê.
 * Se a versão não puder ser lida, carrega direto (nunca deixa de responder).
 */
export async function memoPorVersao<T>(chave: string, carregar: () => Promise<T>): Promise<T> {
  let versao: string;
  try {
    versao = (await versaoDados()).dados;
  } catch {
    return carregar();
  }
  return memo.obter(chave, versao, carregar);
}
