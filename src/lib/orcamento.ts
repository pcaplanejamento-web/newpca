import { and, asc, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { orcamentoItens, orcamentos, orcamentoVinculos, orgaos, reparticoes } from "@/db/schema";
import { getDb } from "./db";
import { lotesDeIds } from "./reparticoes";
import type { OrcamentoItemImport, VinculosOrcamentoPayload } from "./orcamento-validation";
import { type AlvoVinculo, chaveVinculo, type VinculoOrcamento } from "./orcamento-vinculo";

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
/** `ano` = o do PCA escolhido no CABEÇALHO (filtro global; `null` = todos os anos). */
export async function listarOrcamentos(ano?: number | null): Promise<OrcamentoResumo[]> {
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
    .where(ano != null ? eq(orcamentos.ano, ano) : undefined)
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
/** Lançamentos de UM orçamento ou de todos — `ano` restringe aos orçamentos do ano do PCA do CABEÇALHO. */
export async function getOrcamentoItens(orcamentoId?: number, ano?: number | null): Promise<OrcamentoItemRow[]> {
  const db = getDb();
  if (orcamentoId != null)
    return db
      .select(COLS)
      .from(orcamentoItens)
      .where(eq(orcamentoItens.orcamentoId, orcamentoId))
      .orderBy(asc(orcamentoItens.sequencial), asc(orcamentoItens.id));
  const ordem = [asc(orcamentoItens.orcamentoId), asc(orcamentoItens.sequencial), asc(orcamentoItens.id)] as const;
  return ano != null
    ? db
        .select(COLS)
        .from(orcamentoItens)
        .innerJoin(orcamentos, eq(orcamentoItens.orcamentoId, orcamentos.id))
        .where(eq(orcamentos.ano, ano))
        .orderBy(...ordem)
    : db
        .select(COLS)
        .from(orcamentoItens)
        .orderBy(...ordem);
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

// ── VÍNCULOS com o cadastro (Órgão/Unidade do CUBO → órgão/unidade do sistema) ─────────────

// orcamento_vinculos = 5 colunas vinculadas por linha (+1 do SET) → 16 linhas por statement.
const VINCULOS_POR_STMT = 16;

/** Todos os vínculos gravados (o alvo = `orgao_id` ou `reparticao_id`, conforme o tipo). */
export async function listarVinculosOrcamento(): Promise<VinculoOrcamento[]> {
  const rows = await getDb()
    .select({
      tipo: orcamentoVinculos.tipo,
      chave: orcamentoVinculos.chave,
      texto: orcamentoVinculos.texto,
      orgaoId: orcamentoVinculos.orgaoId,
      reparticaoId: orcamentoVinculos.reparticaoId,
    })
    .from(orcamentoVinculos);
  return rows.map((r) => ({ tipo: r.tipo, chave: r.chave, texto: r.texto, alvoId: r.tipo === "orgao" ? r.orgaoId : r.reparticaoId }));
}

/** Órgãos e unidades que podem ser alvo (unidade "Geral" virtual fora), na ordem das telas. */
export async function alvosVinculoOrcamento(): Promise<{ orgaos: AlvoVinculo[]; unidades: AlvoVinculo[] }> {
  const db = getDb();
  const [os, us] = await Promise.all([
    db
      .select({ id: orgaos.id, sigla: orgaos.sigla, nome: orgaos.nome, oculto: orgaos.oculto })
      .from(orgaos)
      .orderBy(asc(orgaos.ordem), asc(orgaos.id)),
    db
      .select({ id: reparticoes.id, sigla: reparticoes.codigo, nome: reparticoes.nome, oculto: reparticoes.oculto, orgaoId: reparticoes.orgaoId })
      .from(reparticoes)
      .where(ne(sql`UPPER(${reparticoes.codigo})`, "GERAL"))
      .orderBy(asc(reparticoes.ordem), asc(reparticoes.id)),
  ]);
  return { orgaos: os, unidades: us };
}

/**
 * Grava vínculos (UPSERT por `tipo`+`chave`; `alvoId` null = desvincular). Confere antes que
 * cada alvo existe no tipo certo (órgão → `orgaos`; unidade → `reparticoes`, nunca a "Geral").
 * Devolve a mensagem de erro (alvo inválido) ou `null` quando gravou.
 */
export async function definirVinculosOrcamento(lista: VinculosOrcamentoPayload["vinculos"]): Promise<string | null> {
  const db = getDb();
  const ids = (tipo: "orgao" | "unidade") => [...new Set(lista.filter((v) => v.tipo === tipo && v.alvoId != null).map((v) => v.alvoId as number))];
  const existentes = async (tipo: "orgao" | "unidade") => {
    const achados = await Promise.all(
      lotesDeIds(ids(tipo)).map((lote) =>
        tipo === "orgao"
          ? db.select({ id: orgaos.id }).from(orgaos).where(inArray(orgaos.id, lote))
          : db
              .select({ id: reparticoes.id })
              .from(reparticoes)
              .where(and(inArray(reparticoes.id, lote), ne(sql`UPPER(${reparticoes.codigo})`, "GERAL"))),
      ),
    );
    return new Set(achados.flat().map((r) => r.id));
  };
  const [okOrgaos, okUnidades] = await Promise.all([existentes("orgao"), existentes("unidade")]);
  for (const v of lista) {
    if (v.alvoId == null) continue;
    if (!(v.tipo === "orgao" ? okOrgaos : okUnidades).has(v.alvoId))
      return `${v.tipo === "orgao" ? "Órgão" : "Unidade"} de destino não encontrado para "${v.texto}".`;
  }
  // Último valor vence quando o mesmo texto vem repetido no lote.
  const porChave = new Map<string, (typeof lista)[number] & { chave: string }>();
  for (const v of lista) {
    const chave = chaveVinculo(v.texto);
    if (chave) porChave.set(`${v.tipo}|${chave}`, { ...v, chave });
  }
  const linhas = [...porChave.values()].map((v) => ({
    tipo: v.tipo,
    chave: v.chave,
    texto: v.texto,
    orgaoId: v.tipo === "orgao" ? v.alvoId : null,
    reparticaoId: v.tipo === "unidade" ? v.alvoId : null,
  }));
  const stmts = [];
  for (let i = 0; i < linhas.length; i += VINCULOS_POR_STMT)
    stmts.push(
      db
        .insert(orcamentoVinculos)
        .values(linhas.slice(i, i + VINCULOS_POR_STMT))
        .onConflictDoUpdate({
          target: [orcamentoVinculos.tipo, orcamentoVinculos.chave],
          set: {
            texto: sql`excluded.texto`,
            orgaoId: sql`excluded.orgao_id`,
            reparticaoId: sql`excluded.reparticao_id`,
            atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
          },
        }),
    );
  if (stmts.length > 0) await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
  return null;
}
