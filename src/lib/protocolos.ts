import { and, desc, eq, isNotNull, like, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import { protocolos } from "@/db/schema";
import { SITUACAO } from "./protocolo-constantes";

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const dataOpc = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null));
const textoOpc = (max: number) =>
  z.string().trim().max(max).optional().nullable().or(z.literal("").transform(() => null));

export const protocoloSchema = z.object({
  data: dataOpc,
  numero: z.string().trim().min(1, "Informe o número do protocolo.").max(60),
  secretaria: textoOpc(300),
  natureza: textoOpc(120),
  responsavel: textoOpc(120),
  situacao: z.enum(SITUACAO).default("em_analise"),
  distribuicao: textoOpc(120),
});
export const protocoloPatchSchema = protocoloSchema.partial();

export type FiltroProtocolos = {
  situacao?: string;
  responsavel?: string;
  natureza?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

export async function listarProtocolos(f: FiltroProtocolos) {
  const db = getDb();
  const conds = [];
  if (f.situacao) conds.push(eq(protocolos.situacao, f.situacao));
  if (f.responsavel) conds.push(eq(protocolos.responsavel, f.responsavel));
  if (f.natureza) conds.push(eq(protocolos.natureza, f.natureza));
  if (f.q && f.q.trim()) {
    const termo = `%${f.q.trim().toLowerCase()}%`;
    conds.push(
      like(
        sql`lower(${protocolos.numero} || ' ' || coalesce(${protocolos.secretaria},'') || ' ' || coalesce(${protocolos.natureza},'') || ' ' || coalesce(${protocolos.responsavel},''))`,
        termo,
      ),
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  const pageSize = clamp(f.pageSize ?? 20, 5, 100);
  const page = Math.max(f.page ?? 1, 1);

  const rows = await db
    .select({
      id: protocolos.id,
      data: protocolos.data,
      numero: protocolos.numero,
      secretaria: protocolos.secretaria,
      natureza: protocolos.natureza,
      responsavel: protocolos.responsavel,
      situacao: protocolos.situacao,
      distribuicao: protocolos.distribuicao,
    })
    .from(protocolos)
    .where(where)
    .orderBy(desc(protocolos.data), desc(protocolos.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ n }] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(protocolos)
    .where(where);

  return {
    rows,
    total: Number(n ?? 0),
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(Number(n ?? 0) / pageSize)),
  };
}

export async function resumoProtocolos() {
  const db = getDb();
  const [tot] = await db.select({ n: sql<number>`COUNT(*)` }).from(protocolos);
  const porSitRows = await db
    .select({ situacao: protocolos.situacao, n: sql<number>`COUNT(*)` })
    .from(protocolos)
    .groupBy(protocolos.situacao);

  const porSituacao: Record<string, number> = {};
  for (const r of porSitRows) porSituacao[r.situacao] = Number(r.n);
  const total = Number(tot?.n ?? 0);
  const finalizados = porSituacao["finalizado"] ?? 0;

  return { total, porSituacao, finalizados, emAberto: total - finalizados };
}

/** Valores distintos (para filtros e sugestões do formulário). */
export async function opcoesProtocolos() {
  const db = getDb();
  const distintos = async (col: typeof protocolos.responsavel) => {
    const rows = await db
      .selectDistinct({ v: col })
      .from(protocolos)
      .where(isNotNull(col))
      .orderBy(col);
    return rows.map((r) => r.v).filter((v): v is string => !!v && v.trim() !== "");
  };
  const [responsaveis, naturezas, distribuicoes] = await Promise.all([
    distintos(protocolos.responsavel),
    distintos(protocolos.natureza),
    distintos(protocolos.distribuicao),
  ]);
  return { responsaveis, naturezas, distribuicoes };
}
