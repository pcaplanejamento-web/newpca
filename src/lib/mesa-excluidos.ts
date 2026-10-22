import { and, desc, eq, inArray, isNotNull, isNull, lt, min, or, type SQLWrapper, sql } from "drizzle-orm";
import { auditoria, dfdProtocolos, dfds, mesaExcluidos, mesaLixeiraDescartados } from "@/db/schema";
import type { EscopoMesa } from "./acesso-mesa";
import type { DfdVisual } from "@/components/DfdView";
import { getDb } from "./db";
import { parseAssinaturas, parseSecoes } from "./dfd";
import { type ExcluidoAntigo, excluidosDaAuditoria, type LinhaAuditoriaExclusao, lerRetratoDfd, pcaPeloHistorico, type RetratoDfd } from "./mesa-excluidos-core";
import { comandoApagarExcluidos, comandoLimparExcluidos, comandosDescartarAntigos } from "./mesa-excluidos-sql";

/** O que a lista da opção "Excluídos" mostra (sem o retrato — ele vem só ao abrir uma linha). */
export type Excluido = {
  id: number;
  tipo: "protocolo" | "dfd" | "item";
  alvoId: number;
  numero: string | null;
  planejamento: string | null;
  protocoloId: number | null;
  protocoloNumero: string | null;
  dfdId: number | null;
  reparticaoId: number | null;
  pcaId: number | null;
  valor: number | null;
  motivo: string;
  excluidoPor: number | null;
  excluidoNome: string | null;
  excluidoEm: string | null;
};

/** Teto da lista (as mais recentes) — a retenção mantém a tabela pequena. */
export const MAX_EXCLUIDOS = 2000;
/** Retenção padrão da lixeira. */
export const DIAS_EXCLUIDOS = 180;

const COLUNAS = {
  id: mesaExcluidos.id,
  tipo: mesaExcluidos.tipo,
  alvoId: mesaExcluidos.alvoId,
  numero: mesaExcluidos.numero,
  planejamento: mesaExcluidos.planejamento,
  protocoloId: mesaExcluidos.protocoloId,
  protocoloNumero: mesaExcluidos.protocoloNumero,
  dfdId: mesaExcluidos.dfdId,
  reparticaoId: mesaExcluidos.reparticaoId,
  pcaId: mesaExcluidos.pcaId,
  valor: mesaExcluidos.valor,
  motivo: mesaExcluidos.motivo,
  excluidoPor: mesaExcluidos.excluidoPor,
  excluidoNome: mesaExcluidos.excluidoNome,
  excluidoEm: mesaExcluidos.excluidoEm,
};

/** Os excluídos de UMA Mesa: a do PCA (`pcaId`) ou a do sistema (`null`). */
export async function listarExcluidos(pcaId: number | null, tipo: Excluido["tipo"]): Promise<Excluido[]> {
  return (await getDb()
    .select(COLUNAS)
    .from(mesaExcluidos)
    .where(and(eq(mesaExcluidos.tipo, tipo), pcaId == null ? isNull(mesaExcluidos.pcaId) : eq(mesaExcluidos.pcaId, pcaId)))
    .orderBy(desc(mesaExcluidos.id))
    .limit(MAX_EXCLUIDOS)) as Excluido[];
}

/** Uma linha com o retrato (o banner). */
export async function getExcluido(id: number): Promise<(Excluido & { retrato: string | null }) | null> {
  const [r] = await getDb()
    .select({ ...COLUNAS, retrato: mesaExcluidos.retrato })
    .from(mesaExcluidos)
    .where(eq(mesaExcluidos.id, id))
    .limit(1);
  return (r as (Excluido & { retrato: string | null }) | undefined) ?? null;
}

/** Os DFDs excluídos junto com um protocolo (a cascata) — para o banner do protocolo excluído. */
export async function dfdsDoProtocoloExcluido(protocoloId: number): Promise<(Excluido & { retrato: string | null })[]> {
  return (await getDb()
    .select({ ...COLUNAS, retrato: mesaExcluidos.retrato })
    .from(mesaExcluidos)
    .where(and(eq(mesaExcluidos.tipo, "dfd"), eq(mesaExcluidos.protocoloId, protocoloId), eq(mesaExcluidos.motivo, "cascata")))
    .orderBy(mesaExcluidos.id)) as (Excluido & { retrato: string | null })[];
}

/** Retenção (cron dos e-mails): tira o que passou de `dias`. Best-effort. */
export async function limparExcluidosVencidos(dias = DIAS_EXCLUIDOS): Promise<void> {
  try {
    const antes = new Date(Date.now() - dias * 86_400_000).toISOString().replace("T", " ").slice(0, 19);
    await getDb().batch([comandoLimparExcluidos(getDb(), antes)]);
  } catch (e) {
    console.error("[mesa-excluidos] retenção falhou:", e);
  }
}

/** Quem vê uma linha da lixeira: a unidade no escopo e, com "só os meus", só o que a própria pessoa excluiu. */
export function excluidoVisivel(esc: EscopoMesa, usuarioId: number, e: Pick<Excluido, "reparticaoId" | "excluidoPor">): boolean {
  return esc.un.acessivel(e.reparticaoId) && (!esc.meus || e.excluidoPor === usuarioId);
}

/** O retrato do DFD no formato do `DfdView` (o banner de consulta), com a sigla/nome da unidade. */
export function visualDoRetrato(r: RetratoDfd, unidade: { codigo: string; nome: string } | null): DfdVisual {
  return {
    numero: r.numero,
    planejamento: r.planejamento,
    tipo: r.tipo,
    objeto: r.objeto,
    orgaoEntidade: r.orgaoEntidade,
    setorRequisitante: r.setorRequisitante,
    responsavel: r.responsavel,
    matricula: r.matricula,
    email: r.email,
    telefone: r.telefone,
    anoPca: r.anoPca,
    numeroContrato: r.numeroContrato,
    numeroAta: r.numeroAta,
    numeroLicitacao: r.numeroLicitacao,
    valorTotal: r.valorTotal,
    reparticaoCodigo: unidade?.codigo ?? null,
    reparticaoNome: unidade?.nome ?? null,
    totalItens: r.itens.length,
    itens: r.itens.map((i) => ({ item: i.item, codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade, valorUnitario: i.valorUnitario, valorTotal: i.valorTotal, dominio: i.dominio })),
    secoes: parseSecoes(r.secoes),
    assinaturas: { lista: parseAssinaturas(r.assinaturas), solicitante: null },
  };
}

/** Uma exclusão ANTIGA (anterior à lixeira), lida do histórico — sem retrato, com o que o histórico guardou. */
export type ExcluidoDoHistorico = ExcluidoAntigo & { reparticaoId: number | null; pcaId: number | null; protocoloNumero: string | null };

/** Os ids num parâmetro JSON só (qualquer quantidade, uma consulta). */
const emIds = (col: SQLWrapper, ids: number[]) => sql`${col} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`;
const lerJson = (t: string | null): Record<string, unknown> | null => {
  try {
    return t ? (JSON.parse(t) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/**
 * As exclusões feitas ANTES da lixeira existir, pelo histórico (a auditoria): protocolos e DFDs excluídos e itens
 * removidos (em massa ou no "Salvar" com o item a item). A unidade vem do registro de quando entrou (protocolação/
 * importação) — ou do DFD vivo, no item —, e a Mesa do último envio/incorporação/devolução do protocolo a um PCA.
 * Só o que veio ANTES da 1ª linha da lixeira (as de depois já têm o retrato).
 */
export async function excluidosDoHistorico(pcaId: number | null, tipo: Excluido["tipo"]): Promise<ExcluidoDoHistorico[]> {
  const db = getDb();
  const [c] = await db.select({ corte: min(mesaExcluidos.excluidoEm) }).from(mesaExcluidos);
  const corte = c?.corte ?? null;
  const filtroTipo =
    tipo === "protocolo"
      ? and(eq(auditoria.entidade, "protocolo"), eq(auditoria.acao, "excluir"))
      : tipo === "dfd"
        ? and(eq(auditoria.entidade, "dfd"), eq(auditoria.acao, "excluir"), or(isNull(auditoria.origem), inArray(auditoria.origem, ["exclusao", "reenvio"])))
        : and(eq(auditoria.entidade, "dfd"), sql`${auditoria.detalhe} LIKE '%"tipo":"removido"%'`);
  const linhas = (await db
    .select({
      id: auditoria.id,
      entidade: auditoria.entidade,
      entidadeId: auditoria.entidadeId,
      resumo: auditoria.resumo,
      antes: auditoria.antes,
      detalhe: auditoria.detalhe,
      origem: auditoria.origem,
      protocoloId: auditoria.protocoloId,
      usuarioId: auditoria.usuarioId,
      usuarioNome: auditoria.usuarioNome,
      criadoEm: auditoria.criadoEm,
    })
    .from(auditoria)
    .where(corte ? and(filtroTipo, lt(auditoria.criadoEm, corte)) : filtroTipo)
    .orderBy(desc(auditoria.id))
    .limit(MAX_EXCLUIDOS)) as LinhaAuditoriaExclusao[];
  const descartados = new Set((await db.select({ c: mesaLixeiraDescartados.chave }).from(mesaLixeiraDescartados)).map((r) => r.c));
  const antigos = linhas.flatMap(excluidosDaAuditoria).filter((e) => e.tipo === tipo && !descartados.has(e.chave));
  if (!antigos.length) return [];

  // Protocolos e DFDs envolvidos.
  const protIds = [...new Set(antigos.map((e) => e.protocoloId).filter((v): v is number => v != null))];
  const dfdIds = [...new Set(antigos.map((e) => e.dfdId).filter((v): v is number => v != null))];

  // A Mesa: o último envio/incorporação/devolução do protocolo.
  const pcaDoProt = new Map<number, number | null>();
  const numeroDoProt = new Map<number, string>();
  const repDoProt = new Map<number, number | null>();
  {
    const l = protIds;
    const regs = await db
      .select({ p: auditoria.protocoloId, pca: auditoria.entidadeId, resumo: auditoria.resumo })
      .from(auditoria)
      .where(and(eq(auditoria.entidade, "pca"), emIds(auditoria.protocoloId, l)))
      .orderBy(desc(auditoria.id));
    for (const r of regs) if (r.p != null && !pcaDoProt.has(r.p)) pcaDoProt.set(r.p, pcaPeloHistorico(r.resumo, r.pca));
    const vivos = await db.select({ id: dfdProtocolos.id, numero: dfdProtocolos.numero, rep: dfdProtocolos.reparticaoId, pca: dfdProtocolos.pcaId }).from(dfdProtocolos).where(emIds(dfdProtocolos.id, l));
    for (const v of vivos) {
      numeroDoProt.set(v.id, v.numero);
      repDoProt.set(v.id, v.rep);
      pcaDoProt.set(v.id, v.pca);
    }
    const criacoes = await db
      .select({ id: auditoria.entidadeId, depois: auditoria.depois })
      .from(auditoria)
      .where(and(eq(auditoria.entidade, "protocolo"), emIds(auditoria.entidadeId, l), isNotNull(auditoria.depois)))
      .orderBy(desc(auditoria.id));
    for (const r of criacoes) {
      if (r.id == null || repDoProt.has(r.id)) continue;
      const d = lerJson(r.depois);
      if (d && "reparticaoId" in d) {
        repDoProt.set(r.id, typeof d.reparticaoId === "number" ? d.reparticaoId : null);
        if (typeof d.numero === "string" && !numeroDoProt.has(r.id)) numeroDoProt.set(r.id, d.numero);
      }
    }
  }
  // A unidade do DFD: o vivo ou o registro de quando entrou.
  const repDoDfd = new Map<number, number | null>();
  {
    const l = dfdIds;
    const vivos = await db.select({ id: dfds.id, rep: dfds.reparticaoId }).from(dfds).where(emIds(dfds.id, l));
    for (const v of vivos) repDoDfd.set(v.id, v.rep);
    const regs = await db
      .select({ id: auditoria.entidadeId, depois: auditoria.depois })
      .from(auditoria)
      .where(and(eq(auditoria.entidade, "dfd"), emIds(auditoria.entidadeId, l), isNotNull(auditoria.depois)))
      .orderBy(desc(auditoria.id));
    for (const r of regs) {
      if (r.id == null || repDoDfd.has(r.id)) continue;
      const d = lerJson(r.depois);
      if (d && typeof d.reparticaoId === "number") repDoDfd.set(r.id, d.reparticaoId);
    }
  }
  return antigos
    .map((e) => {
      const pca = e.protocoloId != null ? (pcaDoProt.get(e.protocoloId) ?? null) : null;
      const rep = (e.dfdId != null ? repDoDfd.get(e.dfdId) : undefined) ?? (e.protocoloId != null ? (repDoProt.get(e.protocoloId) ?? null) : null);
      return { ...e, pcaId: pca, reparticaoId: rep, protocoloNumero: e.protocoloId != null ? (numeroDoProt.get(e.protocoloId) ?? null) : null };
    })
    .filter((e) => (pcaId == null ? e.pcaId == null : e.pcaId === pcaId));
}

/** Um item que saiu JUNTO com um DFD excluído (avulso ou na cascata do protocolo) — a linha virtual da visão Itens. */
export type ItemDoDfdExcluido = {
  dfdExcluidoId: number;
  idx: number;
  item: string | null;
  codigo: string | null;
  descricao: string | null;
  dfdNumero: string | null;
  planejamento: string | null;
  protocoloNumero: string | null;
  reparticaoId: number | null;
  excluidoPor: number | null;
  valor: number | null;
  motivo: string;
  excluidoNome: string | null;
  excluidoEm: string | null;
};

/** Os itens dentro dos retratos dos DFDs excluídos de UMA Mesa. */
export async function itensDosDfdsExcluidos(pcaId: number | null): Promise<ItemDoDfdExcluido[]> {
  const rows = await getDb()
    .select({ ...COLUNAS, retrato: mesaExcluidos.retrato })
    .from(mesaExcluidos)
    .where(and(eq(mesaExcluidos.tipo, "dfd"), pcaId == null ? isNull(mesaExcluidos.pcaId) : eq(mesaExcluidos.pcaId, pcaId)))
    .orderBy(desc(mesaExcluidos.id))
    .limit(MAX_EXCLUIDOS);
  const out: ItemDoDfdExcluido[] = [];
  for (const r of rows) {
    const d = lerRetratoDfd(r.retrato);
    for (const [idx, it] of (d?.itens ?? []).entries())
      out.push({
        dfdExcluidoId: r.id,
        idx,
        item: it.item != null ? String(it.item) : null,
        codigo: it.codigo ?? null,
        descricao: it.descricao ?? null,
        dfdNumero: r.numero,
        planejamento: r.planejamento,
        protocoloNumero: r.protocoloNumero,
        reparticaoId: r.reparticaoId,
        excluidoPor: r.excluidoPor,
        valor: it.valorTotal ?? null,
        motivo: r.motivo,
        excluidoNome: r.excluidoNome,
        excluidoEm: r.excluidoEm,
      });
    if (out.length >= MAX_EXCLUIDOS * 5) break;
  }
  return out;
}

/** As linhas (só id, tipo, protocolo, motivo e o escopo) de UMA Mesa — base da limpeza. */
export async function linhasParaLimpeza(pcaId: number | null) {
  return getDb()
    .select({ id: mesaExcluidos.id, tipo: mesaExcluidos.tipo, protocoloId: mesaExcluidos.protocoloId, motivo: mesaExcluidos.motivo, reparticaoId: mesaExcluidos.reparticaoId, excluidoPor: mesaExcluidos.excluidoPor })
    .from(mesaExcluidos)
    .where(pcaId == null ? isNull(mesaExcluidos.pcaId) : eq(mesaExcluidos.pcaId, pcaId));
}

/** A LIMPEZA definitiva: apaga as linhas da lixeira e descarta as exclusões antigas, num lote. */
export async function limparLixeira(ids: number[], antigos: string[]): Promise<void> {
  const db = getDb();
  const cmds = [...(ids.length ? [comandoApagarExcluidos(db, ids)] : []), ...comandosDescartarAntigos(db, antigos)];
  if (cmds.length) await db.batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]]);
}
