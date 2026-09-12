import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { protocoloOpcoes, protocolos } from "@/db/schema";
import type { CampoOpcao, SituacaoProtocolo } from "@/db/schema";
import { getDb } from "./db";
import { getGrupoAtivo, getGrupoAtivoId, getReparticaoFiltro } from "./grupos";

/** id do grupo ativo, ou -1 (sentinela que não casa com nenhum protocolo/opção).
 * Todos os dados de protocolo são escopados por grupo (RBAC). */
async function grupoAtual(): Promise<number> {
  return (await getGrupoAtivoId()) ?? -1;
}

/** Escopo de LISTAGEM: grupo ativo + repartição ativa do head (código do órgão).
 * repCodigo=null quando o head está em "Geral" (todas as repartições do grupo). */
async function escopo(): Promise<{ grupoId: number; repCodigo: string | null }> {
  const grupo = await getGrupoAtivo();
  const rep = await getReparticaoFiltro(undefined, grupo);
  return { grupoId: grupo?.id ?? -1, repCodigo: rep?.codigo ?? null };
}

// ---------------------------------------------------------------------------
// Constantes de domínio
// ---------------------------------------------------------------------------

/** Situação = enum fixo (com rótulo/cor definidos na UI via <Badge>). */
export const SITUACOES = [
  { valor: "em_analise", label: "Em análise" },
  { valor: "em_andamento", label: "Em andamento" },
  { valor: "finalizado", label: "Finalizado" },
  { valor: "devolvido", label: "Devolvido" },
  { valor: "cancelado", label: "Cancelado" },
] as const satisfies ReadonlyArray<{ valor: SituacaoProtocolo; label: string }>;

const SITUACAO_VALORES = SITUACOES.map((s) => s.valor) as [
  SituacaoProtocolo,
  ...SituacaoProtocolo[],
];

export const CAMPOS_OPCAO = [
  "orgao",
  "natureza",
  "responsavel",
  "distribuicao",
] as const satisfies ReadonlyArray<CampoOpcao>;

export function situacaoLabel(v?: string | null): string {
  return SITUACOES.find((s) => s.valor === v)?.label ?? "—";
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

// ---------------------------------------------------------------------------
// Schemas (zod)
// ---------------------------------------------------------------------------
const textoOpcional = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v : null));

export const protocoloSchema = z.object({
  numero: z.string().trim().min(1, "Informe o número do protocolo.").max(120),
  // Aceita string vazia (limpar) → null; mantém só datas ISO válidas.
  data: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/u.test(v) ? v : null)),
  orgao: textoOpcional,
  orgaoSigla: z.string().trim().max(30).optional().transform((v) => (v ? v : null)),
  natureza: textoOpcional,
  responsavel: textoOpcional,
  situacao: z.enum(SITUACAO_VALORES),
  distribuicao: textoOpcional,
});
export const protocoloPatchSchema = protocoloSchema.partial();

export const opcaoProtocoloSchema = z.object({
  campo: z.enum(CAMPOS_OPCAO),
  valor: z.string().trim().min(1, "Informe um valor.").max(200),
});

export type ProtocoloEntrada = z.infer<typeof protocoloSchema>;

// ---------------------------------------------------------------------------
// Opções (campos de seleção)
// ---------------------------------------------------------------------------
export type OpcoesPorCampo = Record<CampoOpcao, string[]>;

export async function listarOpcoes(): Promise<OpcoesPorCampo> {
  const g = await grupoAtual();
  const rows = await getDb()
    .select({ campo: protocoloOpcoes.campo, valor: protocoloOpcoes.valor })
    .from(protocoloOpcoes)
    .where(eq(protocoloOpcoes.grupoId, g))
    .orderBy(asc(protocoloOpcoes.ordem), asc(protocoloOpcoes.valor));
  const out: OpcoesPorCampo = {
    orgao: [],
    natureza: [],
    responsavel: [],
    distribuicao: [],
  };
  for (const r of rows) out[r.campo]?.push(r.valor);
  return out;
}

export async function adicionarOpcao(campo: CampoOpcao, valor: string) {
  const v = valor.trim();
  if (!v) return null;
  const g = await grupoAtual();
  if (g <= 0) return null;
  await getDb()
    .insert(protocoloOpcoes)
    .values({ campo, valor: v, grupoId: g })
    .onConflictDoNothing();
  return v;
}

export async function removerOpcao(campo: CampoOpcao, valor: string) {
  const g = await grupoAtual();
  await getDb()
    .delete(protocoloOpcoes)
    .where(
      and(
        eq(protocoloOpcoes.campo, campo),
        eq(protocoloOpcoes.valor, valor),
        eq(protocoloOpcoes.grupoId, g),
      ),
    );
}

// ---------------------------------------------------------------------------
// Resumo (StatCards)
// ---------------------------------------------------------------------------
export type ResumoProtocolos = {
  total: number;
  emAnalise: number;
  emAndamento: number;
  finalizado: number;
  devolvido: number;
  cancelado: number;
};

export async function getResumoProtocolos(): Promise<ResumoProtocolos> {
  const { grupoId, repCodigo } = await escopo();
  const where = repCodigo
    ? and(eq(protocolos.grupoId, grupoId), eq(protocolos.orgaoSigla, repCodigo))
    : eq(protocolos.grupoId, grupoId);
  const rows = await getDb()
    .select({ situacao: protocolos.situacao, n: sql<number>`COUNT(*)` })
    .from(protocolos)
    .where(where)
    .groupBy(protocolos.situacao);
  const base: ResumoProtocolos = {
    total: 0,
    emAnalise: 0,
    emAndamento: 0,
    finalizado: 0,
    devolvido: 0,
    cancelado: 0,
  };
  const mapa: Record<SituacaoProtocolo, keyof ResumoProtocolos> = {
    em_analise: "emAnalise",
    em_andamento: "emAndamento",
    finalizado: "finalizado",
    devolvido: "devolvido",
    cancelado: "cancelado",
  };
  for (const r of rows) {
    const n = Number(r.n ?? 0);
    base.total += n;
    const chave = mapa[r.situacao as SituacaoProtocolo];
    if (chave) base[chave] = n;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Listagem / CRUD
// ---------------------------------------------------------------------------
export type ProtocoloListaOpts = {
  q?: string;
  situacao?: string;
  natureza?: string;
  responsavel?: string;
  ano?: string;
  page?: number;
  pageSize?: number;
};

/** Anos distintos presentes (para o filtro de Período). */
export async function listarAnos(): Promise<string[]> {
  const { grupoId, repCodigo } = await escopo();
  const rows = await getDb()
    .select({ ano: sql<string>`substr(${protocolos.data}, 1, 4)` })
    .from(protocolos)
    .where(
      and(
        eq(protocolos.grupoId, grupoId),
        ...(repCodigo ? [eq(protocolos.orgaoSigla, repCodigo)] : []),
        sql`${protocolos.data} IS NOT NULL AND ${protocolos.data} <> ''`,
      ),
    )
    .groupBy(sql`substr(${protocolos.data}, 1, 4)`)
    .orderBy(desc(sql`substr(${protocolos.data}, 1, 4)`));
  return rows.map((r) => r.ano).filter((a): a is string => !!a);
}

const SELECT_PROTOCOLO = {
  id: protocolos.id,
  numero: protocolos.numero,
  data: protocolos.data,
  orgao: protocolos.orgao,
  orgaoSigla: protocolos.orgaoSigla,
  natureza: protocolos.natureza,
  responsavel: protocolos.responsavel,
  situacao: protocolos.situacao,
  distribuicao: protocolos.distribuicao,
} as const;

export type ProtocoloLista = {
  id: number;
  numero: string;
  data: string | null;
  orgao: string | null;
  orgaoSigla: string | null;
  natureza: string | null;
  responsavel: string | null;
  situacao: SituacaoProtocolo;
  distribuicao: string | null;
};

export async function listarProtocolos(opts: ProtocoloListaOpts) {
  const db = getDb();
  const { grupoId, repCodigo } = await escopo();
  const conds = [eq(protocolos.grupoId, grupoId)];
  if (repCodigo) conds.push(eq(protocolos.orgaoSigla, repCodigo));
  if (opts.situacao && SITUACAO_VALORES.includes(opts.situacao as SituacaoProtocolo))
    conds.push(eq(protocolos.situacao, opts.situacao as SituacaoProtocolo));
  if (opts.natureza) conds.push(eq(protocolos.natureza, opts.natureza));
  if (opts.responsavel) conds.push(eq(protocolos.responsavel, opts.responsavel));
  if (opts.ano && /^\d{4}$/u.test(opts.ano))
    conds.push(like(protocolos.data, `${opts.ano}%`));
  if (opts.q && opts.q.trim()) {
    const term = `%${opts.q.trim().toLowerCase()}%`;
    conds.push(
      or(
        like(sql`lower(${protocolos.numero})`, term),
        like(sql`lower(${protocolos.orgao})`, term),
        like(sql`lower(${protocolos.orgaoSigla})`, term),
      ),
    );
  }
  const where = conds.length ? and(...conds) : undefined;

  const pageSize = clamp(opts.pageSize ?? 25, 5, 200);
  const page = Math.max(opts.page ?? 1, 1);

  const rows = await db
    .select(SELECT_PROTOCOLO)
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
    rows: rows as ProtocoloLista[],
    total: Number(n ?? 0),
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(Number(n ?? 0) / pageSize)),
  };
}

export async function protocolosRecentes(limit = 5): Promise<ProtocoloLista[]> {
  const { grupoId, repCodigo } = await escopo();
  const where = repCodigo
    ? and(eq(protocolos.grupoId, grupoId), eq(protocolos.orgaoSigla, repCodigo))
    : eq(protocolos.grupoId, grupoId);
  const rows = await getDb()
    .select(SELECT_PROTOCOLO)
    .from(protocolos)
    .where(where)
    .orderBy(desc(protocolos.criadoEm), desc(protocolos.id))
    .limit(clamp(limit, 1, 20));
  return rows as ProtocoloLista[];
}

export async function criarProtocolo(dados: ProtocoloEntrada, criadoPor: number) {
  const g = await grupoAtual();
  if (g <= 0) throw new Error("Selecione um grupo ativo para cadastrar protocolos.");
  const [p] = await getDb()
    .insert(protocolos)
    .values({ ...dados, criadoPor, grupoId: g })
    .returning({ id: protocolos.id });
  return p.id;
}

export async function atualizarProtocolo(id: number, dados: Partial<ProtocoloEntrada>) {
  const g = await grupoAtual();
  await getDb()
    .update(protocolos)
    .set({ ...dados, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(and(eq(protocolos.id, id), eq(protocolos.grupoId, g)));
}

export async function excluirProtocolo(id: number) {
  const g = await grupoAtual();
  await getDb().delete(protocolos).where(and(eq(protocolos.id, id), eq(protocolos.grupoId, g)));
}
