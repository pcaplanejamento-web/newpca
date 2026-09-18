import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { auditoria } from "@/db/schema";
import { type AcaoAuditoria, type Ator, type EntidadeAuditoria, mesclarHistorico } from "./auditoria-core";
import { getDb } from "./db";

/**
 * Acesso ao D1 da AUDITORIA (append-only). Registrar 1 linha por mutação + consultas
 * (histórico por entidade e listagem global da tela ADM). O núcleo puro (tipos/diff/
 * rótulos) fica em `auditoria-core.ts`.
 */

export type EntradaAuditoria = {
  usuario: Ator;
  acao: AcaoAuditoria;
  entidade: EntidadeAuditoria;
  entidadeId?: number | null;
  resumo?: string | null;
  antes?: unknown;
  depois?: unknown;
};

/** Registra 1 linha de auditoria. **BEST-EFFORT: NUNCA lança** — o log jamais quebra a operação. */
export async function registrarAuditoria(e: EntradaAuditoria): Promise<void> {
  try {
    await getDb()
      .insert(auditoria)
      .values({
        usuarioId: e.usuario?.id ?? null,
        usuarioNome: e.usuario?.nome ?? null,
        usuarioEmail: e.usuario?.email ?? null,
        acao: e.acao,
        entidade: e.entidade,
        entidadeId: e.entidadeId ?? null,
        resumo: e.resumo ?? null,
        antes: e.antes == null ? null : JSON.stringify(e.antes),
        depois: e.depois == null ? null : JSON.stringify(e.depois),
      });
  } catch (err) {
    console.error("[auditoria] falha ao registrar:", err);
  }
}

export type LinhaAuditoria = {
  id: number;
  usuarioId: number | null;
  usuarioNome: string | null;
  usuarioEmail: string | null;
  acao: string;
  entidade: string;
  entidadeId: number | null;
  resumo: string | null;
  antes: string | null;
  depois: string | null;
  criadoEm: string | null;
};

const COLS = {
  id: auditoria.id,
  usuarioId: auditoria.usuarioId,
  usuarioNome: auditoria.usuarioNome,
  usuarioEmail: auditoria.usuarioEmail,
  acao: auditoria.acao,
  entidade: auditoria.entidade,
  entidadeId: auditoria.entidadeId,
  resumo: auditoria.resumo,
  antes: auditoria.antes,
  depois: auditoria.depois,
  criadoEm: auditoria.criadoEm,
};

/** Histórico de UMA entidade (mais recente primeiro). Ordena por `id` (autoincrement). */
export async function historicoDe(
  entidade: EntidadeAuditoria,
  entidadeId: number,
  limite = 200,
): Promise<LinhaAuditoria[]> {
  return getDb()
    .select(COLS)
    .from(auditoria)
    .where(and(eq(auditoria.entidade, entidade), eq(auditoria.entidadeId, entidadeId)))
    .orderBy(desc(auditoria.id))
    .limit(limite);
}

/**
 * Histórico CONECTADO de um DFD: as alterações do PRÓPRIO DFD (que já incluem as edições
 * de itens — logadas sob `entidade:"dfd"`) MESCLADAS com as do seu protocolo atual, do mais
 * recente ao mais antigo. Assim o banner do DFD mostra "histórico de protocolo" além do seu
 * (o protocolo é único → é sempre o vigente; a `entidade` de cada linha identifica a origem).
 */
export async function historicoConectadoDfd(
  dfdId: number,
  protocoloId: number | null,
  limite = 200,
): Promise<LinhaAuditoria[]> {
  const [doDfd, doProtocolo] = await Promise.all([
    historicoDe("dfd", dfdId, limite),
    protocoloId != null ? historicoDe("protocolo", protocoloId, limite) : Promise.resolve([]),
  ]);
  return mesclarHistorico([doDfd, doProtocolo], limite);
}

export type FiltroAuditoria = { entidade?: string; acao?: string; usuarioId?: number; de?: string; ate?: string };

/** Listagem global (tela ADM), paginada + filtros + total. */
export async function listarAuditoria(
  filtro: FiltroAuditoria = {},
  page = 1,
  pageSize = 50,
): Promise<{ linhas: LinhaAuditoria[]; total: number }> {
  const conds = [];
  if (filtro.entidade) conds.push(eq(auditoria.entidade, filtro.entidade));
  if (filtro.acao) conds.push(eq(auditoria.acao, filtro.acao));
  if (filtro.usuarioId != null) conds.push(eq(auditoria.usuarioId, filtro.usuarioId));
  if (filtro.de) conds.push(gte(auditoria.criadoEm, filtro.de));
  if (filtro.ate) conds.push(lte(auditoria.criadoEm, filtro.ate));
  const where = conds.length ? and(...conds) : undefined;
  const db = getDb();
  const [tot] = await db.select({ total: sql<number>`count(*)` }).from(auditoria).where(where);
  const linhas = await db
    .select(COLS)
    .from(auditoria)
    .where(where)
    .orderBy(desc(auditoria.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { linhas, total: Number(tot?.total ?? 0) };
}
