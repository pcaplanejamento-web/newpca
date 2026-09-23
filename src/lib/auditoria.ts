import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { auditoria, dfdProtocolos, dfds, protocoloSituacoes, reparticoes, usuarios } from "@/db/schema";
import {
  type AcaoAuditoria,
  type Ator,
  type DetalheAuditoria,
  detalheDe,
  type EntidadeAuditoria,
  type LinhaHistorico,
  type OrigemAuditoria,
  semDuplicatas,
} from "./auditoria-core";
import { getDb } from "./db";

/**
 * Acesso ao D1 da AUDITORIA (append-only). Registrar 1 linha por mutação + consultas (histórico
 * CONECTADO do protocolo/DFD e a listagem global da tela ADM). O núcleo puro (tipos, diff, rótulos e a
 * interpretação do histórico) fica em `auditoria-core.ts`.
 */

export type EntradaAuditoria = {
  usuario: Ator;
  acao: AcaoAuditoria;
  entidade: EntidadeAuditoria;
  entidadeId?: number | null;
  resumo?: string | null;
  antes?: unknown;
  depois?: unknown;
  /** Protocolo por onde a alteração passou — liga DFD/itens ao histórico do protocolo. */
  protocoloId?: number | null;
  /** Canal (protocolação, reenvio, banner, massa, célula…). */
  origem?: OrigemAuditoria | null;
  /** Detalhe estruturado (campos/seções/assinaturas/itens, antes → depois). */
  detalhe?: DetalheAuditoria | null;
};

/**
 * Monta o DETALHE de uma auditoria sem NUNCA derrubar a operação — ele é montado DEPOIS da gravação (já
 * feita): uma falha de leitura aqui vira a `alternativa` (e um log), nunca um 500 nem uma "falha" falsa.
 */
export async function detalheSeguro<T>(montar: () => Promise<T> | T, alternativa: T): Promise<T> {
  try {
    return await montar();
  } catch (err) {
    console.error("[auditoria] falha ao montar o detalhe:", err);
    return alternativa;
  }
}

/** Registra 1 linha de auditoria. **BEST-EFFORT: NUNCA lança** — o log jamais quebra a operação. */
export async function registrarAuditoria(e: EntradaAuditoria): Promise<void> {
  try {
    const detalhe = e.detalhe ? detalheDe(e.detalhe) : null;
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
        protocoloId: e.protocoloId ?? null,
        origem: e.origem ?? null,
        detalhe: detalhe ? JSON.stringify(detalhe) : null,
      });
  } catch (err) {
    console.error("[auditoria] falha ao registrar:", err);
  }
}

/** Linha de auditoria (histórico) + o e-mail do ator (tela ADM). */
export type LinhaAuditoria = LinhaHistorico & { usuarioEmail: string | null };

/** Colunas do histórico (DFD/protocolo — visto por quem tem acesso à unidade): SEM o e-mail do ator. */
const COLS_HIST = {
  id: auditoria.id,
  usuarioId: auditoria.usuarioId,
  usuarioNome: auditoria.usuarioNome,
  acao: auditoria.acao,
  entidade: auditoria.entidade,
  entidadeId: auditoria.entidadeId,
  resumo: auditoria.resumo,
  antes: auditoria.antes,
  depois: auditoria.depois,
  origem: auditoria.origem,
  detalhe: auditoria.detalhe,
  protocoloId: auditoria.protocoloId,
  protocoloNumero: dfdProtocolos.numero,
  criadoEm: auditoria.criadoEm,
};
/** + o e-mail do ator (só a tela ADM). */
const COLS = { ...COLS_HIST, usuarioEmail: auditoria.usuarioEmail };

/** Consultas base (+ o nº do protocolo de origem — `null` se ele já foi excluído). */
const consulta = () =>
  getDb().select(COLS).from(auditoria).leftJoin(dfdProtocolos, eq(auditoria.protocoloId, dfdProtocolos.id));
const consultaHist = () =>
  getDb().select(COLS_HIST).from(auditoria).leftJoin(dfdProtocolos, eq(auditoria.protocoloId, dfdProtocolos.id));

/** Histórico de UM DFD (mais recente primeiro): toda alteração dele — campos, seções, assinaturas e ITENS
 * (logados sob `entidade:"dfd"`), cada uma com a ORIGEM e o protocolo por onde passou. O mesmo evento
 * logado para os dois protocolos (DFD movido) aparece UMA vez (`semDuplicatas`). */
export async function historicoDfd(dfdId: number, limite = 300): Promise<LinhaHistorico[]> {
  const linhas = await consultaHist()
    .where(and(eq(auditoria.entidade, "dfd"), eq(auditoria.entidadeId, dfdId)))
    .orderBy(desc(auditoria.id))
    .limit(limite);
  return semDuplicatas(linhas);
}

/**
 * Histórico CONECTADO de um PROTOCOLO: as alterações da capa/gestão + TODAS as dos DFDs e itens que
 * passaram por ele (`protocolo_id`) — inclusive DFDs já excluídos — e, do legado (antes da coluna
 * `protocolo_id`), as dos DFDs que estão nele hoje. Mais recente primeiro.
 */
export async function historicoProtocolo(protocoloId: number, limite = 500): Promise<LinhaHistorico[]> {
  return consultaHist()
    .where(
      or(
        and(eq(auditoria.entidade, "protocolo"), eq(auditoria.entidadeId, protocoloId)),
        eq(auditoria.protocoloId, protocoloId),
        and(
          isNull(auditoria.protocoloId),
          eq(auditoria.entidade, "dfd"),
          sql`${auditoria.entidadeId} IN (SELECT ${dfds.id} FROM ${dfds} WHERE ${dfds.protocoloId} = ${protocoloId})`,
        ),
      ),
    )
    .orderBy(desc(auditoria.id))
    .limit(limite);
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
  const linhas = await consulta()
    .where(where)
    .orderBy(desc(auditoria.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { linhas, total: Number(tot?.total ?? 0) };
}

// ---- Rótulos legíveis gravados no detalhe (sobrevivem a renomear/excluir depois) ----

const idsValidos = (ids: (number | null | undefined)[]) => [...new Set(ids.filter((x): x is number => x != null && x > 0))];

/** Sigla (código) de cada unidade citada — "#id" se ela não existe mais. */
export async function rotulosUnidades(ids: (number | null | undefined)[]): Promise<(id: number | null) => string> {
  const uniq = idsValidos(ids);
  const rows = uniq.length ? await getDb().select({ id: reparticoes.id, codigo: reparticoes.codigo }).from(reparticoes).where(inArray(reparticoes.id, uniq)) : [];
  const m = new Map(rows.map((r) => [r.id, r.codigo]));
  return (id) => (id == null ? "—" : (m.get(id) ?? `#${id}`));
}

/** Nome de cada pessoa (usuário) citada. */
export async function nomesPessoas(ids: (number | null | undefined)[]): Promise<(id: number | null) => string> {
  const uniq = idsValidos(ids);
  const rows = uniq.length ? await getDb().select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(inArray(usuarios.id, uniq)) : [];
  const m = new Map(rows.map((r) => [r.id, r.nome]));
  return (id) => (id == null ? "—" : (m.get(id) ?? `#${id}`));
}

/** Nome de cada situação citada. */
export async function nomesSituacoes(ids: (number | null | undefined)[]): Promise<(id: number | null) => string> {
  const uniq = idsValidos(ids);
  const rows = uniq.length
    ? await getDb().select({ id: protocoloSituacoes.id, nome: protocoloSituacoes.nome }).from(protocoloSituacoes).where(inArray(protocoloSituacoes.id, uniq))
    : [];
  const m = new Map(rows.map((r) => [r.id, r.nome]));
  return (id) => (id == null ? "—" : (m.get(id) ?? `#${id}`));
}
