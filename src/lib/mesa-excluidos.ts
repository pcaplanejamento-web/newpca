import { and, desc, eq, isNull } from "drizzle-orm";
import { mesaExcluidos } from "@/db/schema";
import type { EscopoMesa } from "./acesso-mesa";
import type { DfdVisual } from "@/components/DfdView";
import { getDb } from "./db";
import { parseAssinaturas, parseSecoes } from "./dfd";
import type { RetratoDfd } from "./mesa-excluidos-core";
import { comandoLimparExcluidos } from "./mesa-excluidos-sql";

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
    itens: r.itens.map((i) => ({ item: i.item, codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade, valorUnitario: i.valorUnitario, valorTotal: i.valorTotal })),
    secoes: parseSecoes(r.secoes),
    assinaturas: { lista: parseAssinaturas(r.assinaturas), solicitante: null },
  };
}
