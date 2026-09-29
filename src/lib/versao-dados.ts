import { sql } from "drizzle-orm";
import { cache } from "react";
import { auditoria, dfdItens, orcamentoItens } from "@/db/schema";
import { getDb } from "./db";
import { criarMemoVersao } from "./memo-versao-core";

/**
 * VERSÃO DOS DADOS — o sinal de "há dado novo" do sistema inteiro, numa consulta barata: toda escrita passa por
 * `registrarAuditoria` (a `auditoria` é APPEND-ONLY) e os LOTES de itens (DFD e orçamento), gravados depois do registro
 * do início, sobem o id máximo deles. Memorizada por requisição. Usada pelo `SincronizarDados` (o navegador só recarrega
 * quando ela muda) e pelo `memoPorVersao` (o servidor só recalcula quando ela muda).
 */
export const versaoDados = cache(async (): Promise<string> => {
  const [r] = await getDb()
    .select({
      a: sql<number | null>`MAX(${auditoria.id})`,
      i: sql<number | null>`(SELECT MAX(${dfdItens.id}) FROM ${dfdItens})`,
      o: sql<number | null>`(SELECT MAX(${orcamentoItens.id}) FROM ${orcamentoItens})`,
    })
    .from(auditoria);
  return `${r?.a ?? 0}.${r?.i ?? 0}.${r?.o ?? 0}`;
});

const memo = criarMemoVersao({ max: 60, ttlMs: 5 * 60_000, agora: () => Date.now() });

/**
 * O resultado de uma CARGA PESADA (só dados — a chave leva os argumentos, nunca o usuário) guardado na memória do Worker
 * enquanto a versão dos dados for a mesma (validade de segurança de 5 min). O valor é COMPARTILHADO: quem usa só lê.
 * Se a versão não puder ser lida, carrega direto (nunca deixa de responder).
 */
export async function memoPorVersao<T>(chave: string, carregar: () => Promise<T>): Promise<T> {
  let versao: string;
  try {
    versao = await versaoDados();
  } catch {
    return carregar();
  }
  return memo.obter(chave, versao, carregar);
}
