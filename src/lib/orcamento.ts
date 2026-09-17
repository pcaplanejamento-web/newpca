import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { orcamentoItens, orcamentos } from "@/db/schema";
import { getDb } from "./db";
import type { OrcamentoItemImport } from "./orcamento-validation";

/**
 * Acesso a dados do ORÇAMENTO municipal. Base isolada (sem repartição/grupo, sem FK p/
 * PCA/DFD). Só escopo de request (usa `getDb`). Somente leitura na UI: importar/
 * visualizar/excluir (reenviar). Espelha `catalogo.ts`, versão enxuta — sem chave única,
 * sem conflito, sem tipos.
 */

// orcamento_itens = 12 colunas vinculadas por linha → 8×12 = 96 (< limite de 100 do D1).
const ROWS_PER_STMT = 8;

export type OrcamentoResumo = {
  id: number;
  nome: string;
  ano: number;
  totalItens: number;
  valorInicial: number;
  atualizadoEm: string | null;
};

/** Lista os orçamentos (sem lançamentos) — o ano mais recente primeiro. */
export async function listarOrcamentos(): Promise<OrcamentoResumo[]> {
  return getDb()
    .select({
      id: orcamentos.id,
      nome: orcamentos.nome,
      ano: orcamentos.ano,
      totalItens: orcamentos.totalItens,
      valorInicial: orcamentos.valorInicial,
      atualizadoEm: orcamentos.atualizadoEm,
    })
    .from(orcamentos)
    .orderBy(desc(orcamentos.ano), desc(orcamentos.id));
}

export type OrcamentoItemRow = {
  id: number;
  orcamentoId: number;
  orgao: string | null;
  unidade: string | null;
  nomeElemento: string | null;
  codigoElemento: string | null;
  valorEmendaImpositiva: number;
  valorInicial: number;
  valorSuplementacao: number;
  valorEmpenho: number;
  saldo: number;
  valorAnulacao: number;
  sequencial: number | null;
};

const COLS = {
  id: orcamentoItens.id,
  orcamentoId: orcamentoItens.orcamentoId,
  orgao: orcamentoItens.orgao,
  unidade: orcamentoItens.unidade,
  nomeElemento: orcamentoItens.nomeElemento,
  codigoElemento: orcamentoItens.codigoElemento,
  valorEmendaImpositiva: orcamentoItens.valorEmendaImpositiva,
  valorInicial: orcamentoItens.valorInicial,
  valorSuplementacao: orcamentoItens.valorSuplementacao,
  valorEmpenho: orcamentoItens.valorEmpenho,
  saldo: orcamentoItens.saldo,
  valorAnulacao: orcamentoItens.valorAnulacao,
  sequencial: orcamentoItens.sequencial,
};

/** Lançamentos na ordem do arquivo (`sequencial`). Sem `orcamentoId` = de TODOS os
 * orçamentos (a tela carrega tudo e agrupa no cliente). */
export async function getOrcamentoItens(orcamentoId?: number): Promise<OrcamentoItemRow[]> {
  const db = getDb();
  return orcamentoId != null
    ? db
        .select(COLS)
        .from(orcamentoItens)
        .where(eq(orcamentoItens.orcamentoId, orcamentoId))
        .orderBy(asc(orcamentoItens.sequencial), asc(orcamentoItens.id))
    : db
        .select(COLS)
        .from(orcamentoItens)
        .orderBy(asc(orcamentoItens.orcamentoId), asc(orcamentoItens.sequencial), asc(orcamentoItens.id));
}

/** Um orçamento pelo id (`{id,nome,ano}`) — para validar o alvo de uma operação. `null` se não existe. */
export async function getOrcamento(id: number): Promise<{ id: number; nome: string; ano: number } | null> {
  const [o] = await getDb()
    .select({ id: orcamentos.id, nome: orcamentos.nome, ano: orcamentos.ano })
    .from(orcamentos)
    .where(eq(orcamentos.id, id))
    .limit(1);
  return o ?? null;
}

/** Cria um orçamento novo (nome + ano); devolve o id. */
export async function criarOrcamento(nome: string, ano: number): Promise<number> {
  const [o] = await getDb().insert(orcamentos).values({ nome, ano }).returning({ id: orcamentos.id });
  return o.id;
}

/** Edita um orçamento gravado (nome e/ou ano). */
export async function atualizarOrcamento(id: number, campos: { nome?: string; ano?: number }): Promise<void> {
  const set: Record<string, unknown> = { atualizadoEm: sql`(CURRENT_TIMESTAMP)` };
  if (campos.nome !== undefined) set.nome = campos.nome;
  if (campos.ano !== undefined) set.ano = campos.ano;
  await getDb().update(orcamentos).set(set).where(eq(orcamentos.id, id));
}

/** Exclui um orçamento E seus lançamentos (explícito + cascade de backstop), atômico. */
export async function excluirOrcamento(id: number): Promise<void> {
  const db = getDb();
  await db.batch([
    db.delete(orcamentoItens).where(eq(orcamentoItens.orcamentoId, id)),
    db.delete(orcamentos).where(eq(orcamentos.id, id)),
  ]);
}

// biome-ignore lint/suspicious/noExplicitAny: os tipos encadeados do query-builder do Drizzle p/ db.batch() são inviáveis de anotar.
function insertStmts(db: ReturnType<typeof getDb>, orcamentoId: number, itens: OrcamentoItemImport[]): any[] {
  const stmts = [];
  for (let i = 0; i < itens.length; i += ROWS_PER_STMT) {
    stmts.push(
      db.insert(orcamentoItens).values(
        itens.slice(i, i + ROWS_PER_STMT).map((it) => ({
          orcamentoId,
          orgao: it.orgao || null,
          unidade: it.unidade || null,
          nomeElemento: it.nomeElemento || null,
          codigoElemento: it.codigoElemento || null,
          valorEmendaImpositiva: it.valorEmendaImpositiva,
          valorInicial: it.valorInicial,
          valorSuplementacao: it.valorSuplementacao,
          valorEmpenho: it.valorEmpenho,
          saldo: it.saldo,
          valorAnulacao: it.valorAnulacao,
          sequencial: it.sequencial ?? null,
        })),
      ),
    );
  }
  return stmts;
}

/**
 * Grava lançamentos de um orçamento. Insert PURO (sem chave única). IDEMPOTENTE por lote:
 * com `desde`, apaga `sequencial >= desde` antes de reinserir (retry não duplica, como
 * `appendDfdItens`). Recalcula `total_itens = COUNT(*)` e `valor_inicial = SUM(valor_inicial)`.
 */
export async function inserirOrcamentoItens(
  orcamentoId: number,
  itens: OrcamentoItemImport[],
  opts?: { desde?: number },
): Promise<{ inserted: number }> {
  const db = getDb();
  const desde = opts?.desde;
  // biome-ignore lint/suspicious/noExplicitAny: a tupla exigida por db.batch() do Drizzle é inviável de anotar.
  const stmts: any[] = [];
  if (desde != null)
    stmts.push(
      db.delete(orcamentoItens).where(and(eq(orcamentoItens.orcamentoId, orcamentoId), gte(orcamentoItens.sequencial, desde))),
    );
  stmts.push(...insertStmts(db, orcamentoId, itens));
  stmts.push(
    db
      .update(orcamentos)
      .set({
        totalItens: sql`(SELECT COUNT(*) FROM orcamento_itens WHERE orcamento_id = ${orcamentoId})`,
        valorInicial: sql`(SELECT COALESCE(SUM(valor_inicial), 0) FROM orcamento_itens WHERE orcamento_id = ${orcamentoId})`,
        atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(orcamentos.id, orcamentoId)),
  );
  // biome-ignore lint/suspicious/noExplicitAny: a tupla exigida por db.batch() do Drizzle é inviável de anotar.
  await db.batch(stmts as [any, ...any[]]);
  return { inserted: itens.length };
}
