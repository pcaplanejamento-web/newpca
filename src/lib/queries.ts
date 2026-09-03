import { and, asc, desc, eq, isNotNull, like, sql } from "drizzle-orm";
import { getDb } from "./db";
import { itens, unidades } from "@/db/schema";

// ---------------------------------------------------------------------------
// Unidades (para o filtro e cabeçalho)
// ---------------------------------------------------------------------------

export async function getUnidades() {
  const db = getDb();
  return db
    .select({
      id: unidades.id,
      codigo: unidades.codigo,
      municipio: unidades.municipio,
      totalItens: unidades.totalItens,
      valorTotal: unidades.valorTotal,
      atualizadoEm: unidades.atualizadoEm,
    })
    .from(unidades)
    .orderBy(asc(unidades.municipio), asc(unidades.codigo));
}

const filtroUnidade = (unidadeId?: number) =>
  unidadeId ? eq(itens.unidadeId, unidadeId) : undefined;

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export type Resumo = {
  total: number;
  count: number;
  ticket: number;
  maiorNome: string | null;
  maiorValor: number;
  numUnidades: number;
};

export async function getResumo(unidadeId?: number): Promise<Resumo> {
  const db = getDb();
  const w = filtroUnidade(unidadeId);

  const [agg] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${itens.valorTotal}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(itens)
    .where(w);

  const [maior] = await db
    .select({ nome: itens.nomeProduto, valor: itens.valorTotal })
    .from(itens)
    .where(w)
    .orderBy(desc(itens.valorTotal))
    .limit(1);

  const [u] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(unidades);

  const total = Number(agg?.total ?? 0);
  const count = Number(agg?.count ?? 0);

  return {
    total,
    count,
    ticket: count > 0 ? total / count : 0,
    maiorNome: maior?.nome ?? null,
    maiorValor: Number(maior?.valor ?? 0),
    numUnidades: unidadeId ? 1 : Number(u?.n ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Agregações para gráficos
// ---------------------------------------------------------------------------

export type Fatia = { label: string; total: number; count: number };

export async function getPorClassificacao(unidadeId?: number): Promise<Fatia[]> {
  const db = getDb();
  const rows = await db
    .select({
      label: itens.classificacaoNorm,
      total: sql<number>`COALESCE(SUM(${itens.valorTotal}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(itens)
    .where(filtroUnidade(unidadeId))
    .groupBy(itens.classificacaoNorm)
    .orderBy(desc(sql`SUM(${itens.valorTotal})`));
  return rows.map((r) => ({
    label: r.label ?? "—",
    total: Number(r.total),
    count: Number(r.count),
  }));
}

export async function getPorUnidadeMedida(unidadeId?: number): Promise<Fatia[]> {
  const db = getDb();
  const rows = await db
    .select({
      label: itens.unidadeMedidaNorm,
      total: sql<number>`COALESCE(SUM(${itens.valorTotal}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(itens)
    .where(filtroUnidade(unidadeId))
    .groupBy(itens.unidadeMedidaNorm)
    .orderBy(desc(sql`COUNT(*)`));
  return rows.map((r) => ({
    label: r.label ?? "—",
    total: Number(r.total),
    count: Number(r.count),
  }));
}

export type PontoMensal = {
  ano: number;
  mes: number;
  total: number;
  count: number;
};

export async function getPorMes(unidadeId?: number): Promise<PontoMensal[]> {
  const db = getDb();
  const rows = await db
    .select({
      ano: itens.anoDesejado,
      mes: itens.mesDesejado,
      total: sql<number>`COALESCE(SUM(${itens.valorTotal}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(itens)
    .where(and(filtroUnidade(unidadeId), isNotNull(itens.anoDesejado)))
    .groupBy(itens.anoDesejado, itens.mesDesejado)
    .orderBy(asc(itens.anoDesejado), asc(itens.mesDesejado));
  return rows.map((r) => ({
    ano: Number(r.ano),
    mes: Number(r.mes),
    total: Number(r.total),
    count: Number(r.count),
  }));
}

export type TopItem = {
  nome: string | null;
  valor: number;
  quantidade: number | null;
  unidadeMedida: string | null;
  codigo: string | null;
};

export async function getTopItens(
  unidadeId?: number,
  limit = 10,
): Promise<TopItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      nome: itens.nomeProduto,
      valor: itens.valorTotal,
      quantidade: itens.quantidade,
      unidadeMedida: itens.unidadeMedidaNorm,
      codigo: unidades.codigo,
    })
    .from(itens)
    .leftJoin(unidades, eq(itens.unidadeId, unidades.id))
    .where(filtroUnidade(unidadeId))
    .orderBy(desc(itens.valorTotal))
    .limit(limit);
  return rows.map((r) => ({
    nome: r.nome,
    valor: Number(r.valor ?? 0),
    quantidade: r.quantidade == null ? null : Number(r.quantidade),
    unidadeMedida: r.unidadeMedida,
    codigo: r.codigo,
  }));
}

/** Anos distintos presentes (para o filtro da tabela). */
export async function getAnos(unidadeId?: number): Promise<number[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ ano: itens.anoDesejado })
    .from(itens)
    .where(and(filtroUnidade(unidadeId), isNotNull(itens.anoDesejado)))
    .orderBy(asc(itens.anoDesejado));
  return rows.map((r) => Number(r.ano)).filter((n) => Number.isFinite(n));
}

// ---------------------------------------------------------------------------
// Tabela de itens (busca / filtro / ordenação / paginação)
// ---------------------------------------------------------------------------

export type ItensQuery = {
  unidadeId?: number;
  q?: string;
  classificacao?: string;
  ano?: number;
  page?: number;
  pageSize?: number;
  sort?: "valor" | "nome" | "seq" | "quantidade";
  dir?: "asc" | "desc";
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(Math.max(n, lo), hi);

export async function getItens(params: ItensQuery) {
  const db = getDb();
  const conds = [] as (ReturnType<typeof eq> | undefined)[];
  if (params.unidadeId) conds.push(eq(itens.unidadeId, params.unidadeId));
  if (params.classificacao)
    conds.push(eq(itens.classificacaoNorm, params.classificacao));
  if (params.ano) conds.push(eq(itens.anoDesejado, params.ano));
  if (params.q && params.q.trim()) {
    const term = `%${params.q.trim().toLowerCase()}%`;
    conds.push(like(sql`lower(${itens.nomeProduto})`, term));
  }
  const where = conds.length ? and(...conds) : undefined;

  const pageSize = clamp(params.pageSize ?? 25, 5, 200);
  const page = Math.max(params.page ?? 1, 1);
  const offset = (page - 1) * pageSize;

  const sortCol =
    params.sort === "nome"
      ? itens.nomeProduto
      : params.sort === "seq"
        ? itens.sequencial
        : params.sort === "quantidade"
          ? itens.quantidade
          : itens.valorTotal;
  const order = params.dir === "asc" ? asc(sortCol) : desc(sortCol);

  const rows = await db
    .select({
      id: itens.id,
      idProduto: itens.idProduto,
      sequencial: itens.sequencial,
      nomeProduto: itens.nomeProduto,
      unidadeMedida: itens.unidadeMedidaNorm,
      quantidade: itens.quantidade,
      valorReferencia: itens.valorReferencia,
      valorTotal: itens.valorTotal,
      classificacao: itens.classificacaoNorm,
      dataDesejada: itens.dataDesejada,
      codigo: unidades.codigo,
      municipio: unidades.municipio,
    })
    .from(itens)
    .leftJoin(unidades, eq(itens.unidadeId, unidades.id))
    .where(where)
    .orderBy(order)
    .limit(pageSize)
    .offset(offset);

  const [{ n }] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(itens)
    .where(where);

  return {
    rows,
    total: Number(n ?? 0),
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(Number(n ?? 0) / pageSize)),
  };
}

/** Classificações distintas (para o filtro da tabela). */
export async function getClassificacoes(unidadeId?: number): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ c: itens.classificacaoNorm })
    .from(itens)
    .where(filtroUnidade(unidadeId))
    .orderBy(asc(itens.classificacaoNorm));
  return rows.map((r) => r.c).filter((c): c is string => !!c);
}
