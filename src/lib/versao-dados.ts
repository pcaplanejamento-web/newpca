import { sql } from "drizzle-orm";
import { cache } from "react";
import { auditoria, dfdItens, itens, orcamentoItens } from "@/db/schema";
import { getDb } from "./db";
import { criarMemoVersao } from "./memo-versao-core";
import { DA_AGENDA, DA_EXECUCAO, DAS_TAREFAS, FORA_DOS_DADOS, type VersoesDados } from "./versao-dados-core";

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

/**
 * O último id de cada versão lido DE TRÁS PARA A FRENTE (`ORDER BY id DESC LIMIT 1`): o SQLite para na 1ª linha que passa
 * no filtro — lê poucas linhas, nunca a tabela inteira (o `MAX(CASE…)` sem WHERE lia a `auditoria` toda a cada pedido e
 * esgotava a cota diária de leituras do D1).
 */
const BASE = sql`${auditoria.acao} NOT IN ('login', 'logout') AND ${auditoria.entidade} <> 'sessao'`;

/**
 * O último id de um conjunto de entidades: UMA busca no índice `(entidade, id)` por entidade (`max()` escalar das
 * subconsultas) — nunca varre a tabela.
 */
function ultimoDe(entidades: readonly string[]) {
  const partes = entidades.map((e) => sql`COALESCE((SELECT MAX(${auditoria.id}) FROM ${auditoria} WHERE ${auditoria.entidade} = ${e}), 0)`);
  return partes.length === 1 ? partes[0] : sql`max(${sql.join(partes, sql`, `)})`;
}

export const versaoDados = cache(async (): Promise<VersoesDados> => {
  const [r] = await getDb()
    .select({
      // Só o que muda DADO: login/logout e a sessão não invalidam as cargas nem o cache das telas.
      a: sql<number | null>`(SELECT ${auditoria.id} FROM ${auditoria} WHERE ${BASE} ORDER BY ${auditoria.id} DESC LIMIT 1)`,
      d: sql<number | null>`(SELECT ${auditoria.id} FROM ${auditoria} WHERE ${BASE} AND ${auditoria.entidade} NOT IN (${FORA}) ORDER BY ${auditoria.id} DESC LIMIT 1)`,
      i: sql<number | null>`(SELECT MAX(${dfdItens.id}) FROM ${dfdItens})`,
      o: sql<number | null>`(SELECT MAX(${orcamentoItens.id}) FROM ${orcamentoItens})`,
      p: sql<number | null>`(SELECT MAX(${itens.id}) FROM ${itens})`,
      t: sql<number | null>`${ultimoDe(DAS_TAREFAS)}`,
      g: sql<number | null>`${ultimoDe(DA_AGENDA)}`,
      e: sql<number | null>`${ultimoDe(DA_EXECUCAO)}`,
    })
    .from(sql`(SELECT 1)`);
  const lotes = `${r?.i ?? 0}.${r?.o ?? 0}.${r?.p ?? 0}`;
  return {
    completa: `${r?.a ?? 0}.${lotes}`,
    dados: `${r?.d ?? 0}.${lotes}`,
    tarefas: String(r?.t ?? 0),
    agenda: String(r?.g ?? 0),
    execucao: String(r?.e ?? 0),
  };
});

const memo = criarMemoVersao({ max: 60, ttlMs: 2 * 60 * 60_000, agora: () => Date.now() });

/**
 * O resultado de uma CARGA PESADA (só dados — a chave leva os argumentos, nunca o usuário) guardado na memória do Worker
 * enquanto a versão `dados` for a mesma (validade de segurança de 2 h). O valor é COMPARTILHADO: quem usa só lê.
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
