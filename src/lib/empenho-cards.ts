import { and, asc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { empenhoCards, orgaos, reparticoes } from "@/db/schema";
import { getDb } from "./db";
import { type CardEmpenho, type EdicaoCard, lerAnos, lerRegraRemovidos, type ResumoCard, type VinculoCard } from "./empenho-cards-core";
import { comandosCriarCard, consultaCatalogo, consultaVinculosCard } from "./empenho-cards-sql";
import type { EscopoEmpenhos } from "./empenhos-tela-core";
import { doEscopo } from "./empenhos-tela-sql";
import { ORDEM_ORGAOS } from "./orgaos";

/** Os CARDS de EMPENHOS no D1 (leitura e edição). Os comandos em lote ficam em `empenho-cards-sql.ts`. */

type Linha = typeof empenhoCards.$inferSelect;

function paraCard(l: Linha): CardEmpenho {
  return { ...l, anos: lerAnos(l.anos), removidos: lerRegraRemovidos(l.removidos) };
}

/**
 * Os cards com os números do que está gravado (os empenhos vigentes DO ESCOPO da pessoa e a soma empenhada), quantos
 * vínculos e se há uma importação lendo agora.
 */
export async function listarCards(escopo: EscopoEmpenhos, id?: number): Promise<ResumoCard[]> {
  const so = escopo === null ? sql`` : sql.join([sql.raw(" AND "), doEscopo(escopo, "e.")], sql.raw(""));
  const l = await getDb()
    .select({
      card: empenhoCards,
      empenhos: sql<number>`(SELECT COUNT(*) FROM "empenhos" e WHERE e."card_id" = "empenho_cards"."id" AND e."removido_em" IS NULL${so})`,
      soma: sql<number>`(SELECT IFNULL(SUM(e."valor_empenhado"), 0) FROM "empenhos" e WHERE e."card_id" = "empenho_cards"."id" AND e."removido_em" IS NULL${so})`,
      vinculos: sql<number>`(SELECT COUNT(*) FROM "empenho_card_vinculos" v WHERE v."card_id" = "empenho_cards"."id")`,
      lendo: sql<number>`EXISTS (SELECT 1 FROM "centi_lotes" l WHERE l."card_id" = "empenho_cards"."id" AND l."estado" = 'lendo')`,
    })
    .from(empenhoCards)
    .where(id == null ? undefined : eq(empenhoCards.id, id))
    .orderBy(asc(empenhoCards.nome), asc(empenhoCards.id));
  return l.map((x) => ({ ...paraCard(x.card), empenhos: Number(x.empenhos), soma: Number(x.soma), vinculos: Number(x.vinculos), lendo: !!Number(x.lendo) }));
}

export async function getCard(id: number): Promise<CardEmpenho | null> {
  const [l] = await getDb().select().from(empenhoCards).where(eq(empenhoCards.id, id)).limit(1);
  return l ? paraCard(l) : null;
}

/** Os cards ligados (a atualização automática) — só os CONFIGURADOS e com vínculos (`pendenciasDoCard`). */
export async function cardsAtivos(): Promise<CardEmpenho[]> {
  const l = await getDb()
    .select()
    .from(empenhoCards)
    .where(
      and(
        eq(empenhoCards.ativa, true),
        isNotNull(empenhoCards.configuradoEm),
        sql`EXISTS (SELECT 1 FROM "empenho_card_vinculos" v WHERE v."card_id" = "empenho_cards"."id")`,
      ),
    )
    .orderBy(asc(empenhoCards.id));
  return l.map(paraCard);
}

const valoresDaEdicao = (e: EdicaoCard) => ({ ...e, anos: JSON.stringify(e.anos) });

/** Cria o card (e copia os vínculos de `copiarDe`, quando escolhido) — devolve o id. */
export async function criarCard(e: EdicaoCard, copiarDe: number | null, quem: string): Promise<number> {
  const db = getDb();
  const r = (await db.batch(comandosCriarCard(db, { ...valoresDaEdicao(e), criadoPor: quem }, copiarDe) as never)) as { id: number }[][];
  return Number(r[r.length - 1][0]?.id);
}

export async function atualizarCard(id: number, e: EdicaoCard): Promise<void> {
  await getDb()
    .update(empenhoCards)
    .set({ ...valoresDaEdicao(e), atualizadoEm: sql`CURRENT_TIMESTAMP`, configuradoEm: sql`CURRENT_TIMESTAMP` })
    .where(eq(empenhoCards.id, id));
}

/** Exclui o card — as importações, os vínculos e os empenhos dele saem junto (cascata). */
export async function excluirCard(id: number): Promise<boolean> {
  const r = await getDb().delete(empenhoCards).where(eq(empenhoCards.id, id)).returning({ id: empenhoCards.id });
  return r.length > 0;
}

/** A última leitura do card (o selo e "Última leitura"). */
export async function registrarLeituraCard(id: number, status: "completo" | "parcial" | "falhou", contagem: number, total: number | null): Promise<void> {
  await getDb()
    .update(empenhoCards)
    .set({ ultimaExecucao: sql`CURRENT_TIMESTAMP`, ultimoStatus: status, ultimaContagem: contagem, ultimoTotal: total })
    .where(eq(empenhoCards.id, id));
}

export async function vinculosDoCard(id: number): Promise<VinculoCard[]> {
  return consultaVinculosCard(getDb(), id);
}

export async function catalogoCenti() {
  return consultaCatalogo(getDb());
}

export type OrgaoVinculo = { id: number; sigla: string; nome: string };
export type UnidadeVinculo = { id: number; codigo: string; nome: string; orgaoId: number | null };

/** O cadastro que os vínculos escolhem: os órgãos e as unidades (sem as ocultas e sem a "Geral"). */
export async function cadastroParaVinculos(ocultos = false): Promise<{ orgaos: OrgaoVinculo[]; unidades: UnidadeVinculo[] }> {
  const db = getDb();
  const [o, u] = await Promise.all([
    db.select({ id: orgaos.id, sigla: orgaos.sigla, nome: orgaos.nome }).from(orgaos).where(ocultos ? undefined : eq(orgaos.oculto, false)).orderBy(...ORDEM_ORGAOS),
    db
      .select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome, orgaoId: reparticoes.orgaoId })
      .from(reparticoes)
      .where(ocultos ? ne(reparticoes.codigo, "GERAL") : and(eq(reparticoes.oculto, false), ne(reparticoes.codigo, "GERAL")))
      .orderBy(asc(reparticoes.ordem), asc(reparticoes.nome)),
  ]);
  return { orgaos: o, unidades: u };
}

/** O cadastro como a regra dos vínculos o confere (`motivoVinculosInvalidos`): os órgãos e a unidade → o órgão dela (os
 * ocultos também — o vínculo gravado antes de ocultar segue valendo). */
export async function cadastroDaRegra(): Promise<{ orgaos: Set<number>; unidades: Map<number, number | null> }> {
  const c = await cadastroParaVinculos(true);
  return { orgaos: new Set(c.orgaos.map((o) => o.id)), unidades: new Map(c.unidades.map((u) => [u.id, u.orgaoId])) };
}
