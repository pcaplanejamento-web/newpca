import { and, desc, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import { protocolos, usuarios } from "@/db/schema";
import { PRIORIDADE_PROTOCOLO, STATUS_PROTOCOLO } from "./protocolo-constantes";

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const dataOpc = z
  .string()
  .trim()
  .max(10)
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null));

export const protocoloSchema = z.object({
  numero: z.string().trim().min(1, "Informe o número do protocolo.").max(60),
  assunto: z.string().trim().min(2, "Informe o assunto.").max(500),
  secretaria: z.string().trim().max(160).optional().nullable(),
  responsavelId: z.number().int().positive().optional().nullable(),
  status: z.enum(STATUS_PROTOCOLO).default("recebido"),
  prioridade: z.enum(PRIORIDADE_PROTOCOLO).default("media"),
  dataEntrada: dataOpc,
  prazo: dataOpc,
  dataConclusao: dataOpc,
  observacoes: z.string().trim().max(4000).optional().nullable(),
});
export const protocoloPatchSchema = protocoloSchema.partial();

export type FiltroProtocolos = {
  status?: string;
  prioridade?: string;
  responsavelId?: number;
  q?: string;
  page?: number;
  pageSize?: number;
};

export async function listarProtocolos(f: FiltroProtocolos) {
  const db = getDb();
  const conds = [];
  if (f.status && STATUS_PROTOCOLO.includes(f.status as never))
    conds.push(eq(protocolos.status, f.status as never));
  if (f.prioridade && PRIORIDADE_PROTOCOLO.includes(f.prioridade as never))
    conds.push(eq(protocolos.prioridade, f.prioridade as never));
  if (f.responsavelId) conds.push(eq(protocolos.responsavelId, f.responsavelId));
  if (f.q && f.q.trim()) {
    const termo = `%${f.q.trim().toLowerCase()}%`;
    conds.push(
      like(
        sql`lower(${protocolos.numero} || ' ' || ${protocolos.assunto} || ' ' || coalesce(${protocolos.secretaria}, ''))`,
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
      numero: protocolos.numero,
      assunto: protocolos.assunto,
      secretaria: protocolos.secretaria,
      status: protocolos.status,
      prioridade: protocolos.prioridade,
      dataEntrada: protocolos.dataEntrada,
      prazo: protocolos.prazo,
      dataConclusao: protocolos.dataConclusao,
      observacoes: protocolos.observacoes,
      responsavelId: protocolos.responsavelId,
      responsavelNome: usuarios.nome,
    })
    .from(protocolos)
    .leftJoin(usuarios, eq(protocolos.responsavelId, usuarios.id))
    .where(where)
    .orderBy(desc(protocolos.criadoEm))
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
  const hoje = new Date().toISOString().slice(0, 10);

  const [tot] = await db.select({ n: sql<number>`COUNT(*)` }).from(protocolos);
  const porStatusRows = await db
    .select({ status: protocolos.status, n: sql<number>`COUNT(*)` })
    .from(protocolos)
    .groupBy(protocolos.status);
  const [venc] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(protocolos)
    .where(
      and(
        sql`${protocolos.prazo} is not null and ${protocolos.prazo} < ${hoje}`,
        sql`${protocolos.status} not in ('concluido','arquivado')`,
      ),
    );

  const porStatus: Record<string, number> = {};
  for (const r of porStatusRows) porStatus[r.status] = Number(r.n);

  return {
    total: Number(tot?.n ?? 0),
    porStatus,
    emAberto:
      Number(tot?.n ?? 0) -
      (porStatus["concluido"] ?? 0) -
      (porStatus["arquivado"] ?? 0),
    vencidos: Number(venc?.n ?? 0),
  };
}

export async function usuariosAtivos() {
  return getDb()
    .select({ id: usuarios.id, nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.status, "ativo"))
    .orderBy(usuarios.nome);
}
