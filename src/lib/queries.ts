import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { itens, unidades } from "@/db/schema";

// ---------------------------------------------------------------------------
// Unidades (para o filtro e cabeçalho)
// ---------------------------------------------------------------------------

/** Unidades importadas. Com `reparticaoId`, restringe às daquela repartição
 * (visão do head); sem ele (Geral), lista todas. */
export async function getUnidades(reparticaoId?: number) {
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
    .where(reparticaoId ? eq(unidades.reparticaoId, reparticaoId) : undefined)
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

export type ItemRow = {
  id: number;
  idProduto: string | null;
  sequencial: number | null;
  nomeProduto: string | null;
  unidadeMedida: string | null;
  quantidade: number | null;
  valorReferencia: number | null;
  valorTotal: number | null;
  classificacao: string | null;
  dataDesejada: string | null;
  codigo: string | null;
  municipio: string | null;
};

/** Todos os itens (com teto de segurança) — a tabela do dashboard filtra, ordena
 * e pagina no CLIENTE (DataTable). Ordenado por valor desc por padrão. */
export async function getItensTodos(unidadeId?: number, limite = 5000): Promise<ItemRow[]> {
  const db = getDb();
  return db
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
    .where(filtroUnidade(unidadeId))
    .orderBy(desc(itens.valorTotal))
    .limit(limite);
}
