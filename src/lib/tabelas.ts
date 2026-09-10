import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import { colunaOpcoes, colunas, linhas, tabelas } from "@/db/schema";

export const TIPOS_COLUNA = ["texto", "selecao", "data", "numero"] as const;
export type TipoColuna = (typeof TIPOS_COLUNA)[number];

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
function safeParse(s: string): Record<string, string> {
  try {
    const o = JSON.parse(s);
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

export const nomeSchema = z.object({ nome: z.string().trim().min(1, "Informe um nome.").max(120) });
export const colunaSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da coluna.").max(120),
  tipo: z.enum(TIPOS_COLUNA).default("texto"),
});
export const colunaPatchSchema = colunaSchema.partial();
export const linhaSchema = z.object({
  dados: z.record(z.string(), z.string()).default({}),
});
export const opcaoSchema = z.object({ valor: z.string().trim().min(1).max(200) });

// ---------------------------------------------------------------------------
// Tabelas
// ---------------------------------------------------------------------------
export async function listarTabelas() {
  const db = getDb();
  const ts = await db
    .select({
      id: tabelas.id,
      nome: tabelas.nome,
      descricao: tabelas.descricao,
      atualizadoEm: tabelas.atualizadoEm,
    })
    .from(tabelas)
    .orderBy(asc(tabelas.ordem), asc(tabelas.id));

  const lc = await db
    .select({ tabelaId: linhas.tabelaId, n: sql<number>`COUNT(*)` })
    .from(linhas)
    .groupBy(linhas.tabelaId);
  const cc = await db
    .select({ tabelaId: colunas.tabelaId, n: sql<number>`COUNT(*)` })
    .from(colunas)
    .groupBy(colunas.tabelaId);
  const lMap = new Map(lc.map((r) => [r.tabelaId, Number(r.n)]));
  const cMap = new Map(cc.map((r) => [r.tabelaId, Number(r.n)]));

  return ts.map((t) => ({
    ...t,
    linhas: lMap.get(t.id) ?? 0,
    colunas: cMap.get(t.id) ?? 0,
  }));
}

export async function criarTabela(nome: string, criadoPor: number) {
  const [t] = await getDb()
    .insert(tabelas)
    .values({ nome, criadoPor })
    .returning({ id: tabelas.id });
  return t.id;
}
export async function renomearTabela(id: number, nome: string) {
  await getDb()
    .update(tabelas)
    .set({ nome, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(tabelas.id, id));
}
export async function excluirTabela(id: number) {
  await getDb().delete(tabelas).where(eq(tabelas.id, id));
}

export async function getTabelaDetalhe(id: number) {
  const db = getDb();
  const [t] = await db.select().from(tabelas).where(eq(tabelas.id, id)).limit(1);
  if (!t) return null;

  const cols = await db
    .select({ id: colunas.id, nome: colunas.nome, tipo: colunas.tipo, ordem: colunas.ordem })
    .from(colunas)
    .where(eq(colunas.tabelaId, id))
    .orderBy(asc(colunas.ordem), asc(colunas.id));

  const ops = await db
    .select({ colunaId: colunaOpcoes.colunaId, valor: colunaOpcoes.valor })
    .from(colunaOpcoes)
    .innerJoin(colunas, eq(colunaOpcoes.colunaId, colunas.id))
    .where(eq(colunas.tabelaId, id))
    .orderBy(asc(colunaOpcoes.valor));

  const porColuna = new Map<number, string[]>();
  for (const o of ops) {
    const arr = porColuna.get(o.colunaId) ?? [];
    arr.push(o.valor);
    porColuna.set(o.colunaId, arr);
  }

  return {
    tabela: { id: t.id, nome: t.nome, descricao: t.descricao },
    colunas: cols.map((c) => ({ ...c, opcoes: porColuna.get(c.id) ?? [] })),
  };
}

// ---------------------------------------------------------------------------
// Colunas
// ---------------------------------------------------------------------------
export async function adicionarColuna(tabelaId: number, nome: string, tipo: TipoColuna) {
  const db = getDb();
  const [m] = await db
    .select({ max: sql<number>`COALESCE(MAX(${colunas.ordem}), -1)` })
    .from(colunas)
    .where(eq(colunas.tabelaId, tabelaId));
  const [c] = await db
    .insert(colunas)
    .values({ tabelaId, nome, tipo, ordem: Number(m?.max ?? -1) + 1 })
    .returning({ id: colunas.id });
  return c.id;
}
export async function atualizarColuna(id: number, campos: { nome?: string; tipo?: TipoColuna }) {
  await getDb().update(colunas).set(campos).where(eq(colunas.id, id));
}
export async function excluirColuna(id: number) {
  await getDb().delete(colunas).where(eq(colunas.id, id));
}

// ---------------------------------------------------------------------------
// Opções (colunas de seleção)
// ---------------------------------------------------------------------------
export async function adicionarOpcao(colunaId: number, valor: string) {
  const v = valor.trim();
  if (!v) return null;
  await getDb().insert(colunaOpcoes).values({ colunaId, valor: v }).onConflictDoNothing();
  return v;
}
export async function removerOpcao(colunaId: number, valor: string) {
  await getDb()
    .delete(colunaOpcoes)
    .where(and(eq(colunaOpcoes.colunaId, colunaId), eq(colunaOpcoes.valor, valor)));
}

// ---------------------------------------------------------------------------
// Linhas
// ---------------------------------------------------------------------------
export async function listarLinhas(
  tabelaId: number,
  opts: { q?: string; page?: number; pageSize?: number },
) {
  const db = getDb();
  const conds = [eq(linhas.tabelaId, tabelaId)];
  if (opts.q && opts.q.trim())
    conds.push(like(sql`lower(${linhas.dados})`, `%${opts.q.trim().toLowerCase()}%`));
  const where = and(...conds);
  const pageSize = clamp(opts.pageSize ?? 30, 5, 200);
  const page = Math.max(opts.page ?? 1, 1);

  const rows = await db
    .select({ id: linhas.id, dados: linhas.dados })
    .from(linhas)
    .where(where)
    .orderBy(desc(linhas.criadoEm), desc(linhas.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [{ n }] = await db.select({ n: sql<number>`COUNT(*)` }).from(linhas).where(where);

  return {
    rows: rows.map((r) => ({ id: r.id, dados: safeParse(r.dados) })),
    total: Number(n ?? 0),
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(Number(n ?? 0) / pageSize)),
  };
}
export async function criarLinha(tabelaId: number, dados: Record<string, string>, criadoPor: number) {
  const [l] = await getDb()
    .insert(linhas)
    .values({ tabelaId, dados: JSON.stringify(dados ?? {}), criadoPor })
    .returning({ id: linhas.id });
  return l.id;
}
export async function atualizarLinha(id: number, dados: Record<string, string>) {
  await getDb()
    .update(linhas)
    .set({ dados: JSON.stringify(dados ?? {}), atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(linhas.id, id));
}
export async function excluirLinha(id: number) {
  await getDb().delete(linhas).where(eq(linhas.id, id));
}
