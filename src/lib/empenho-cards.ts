import { and, asc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { empenhoCards, orgaos, reparticoes } from "@/db/schema";
import { getDb } from "./db";
import { type CardEmpenho, type EdicaoCard, lerAnos, lerRegraRemovidos, type ResumoCard, type VinculoCard } from "./empenho-cards-core";
import { comandosCriarCard, consultaCatalogo, consultaVinculosCard } from "./empenho-cards-sql";
import type { EscopoEmpenhos } from "./empenhos-tela-core";
import { doEscopo } from "./empenhos-tela-sql";
import { orgaosCentiDoCard } from "./liquidacoes-core";
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
  const db = getDb();
  const [l, somas] = await Promise.all([
    db
      .select({
        card: empenhoCards,
        vinculos: sql<number>`(SELECT COUNT(*) FROM "empenho_card_vinculos" v WHERE v."card_id" = "empenho_cards"."id")`,
        lendo: sql<number>`EXISTS (SELECT 1 FROM "centi_lotes" l WHERE l."card_id" = "empenho_cards"."id" AND l."estado" = 'lendo')`,
      })
      .from(empenhoCards)
      .where(id == null ? undefined : eq(empenhoCards.id, id))
      .orderBy(asc(empenhoCards.nome), asc(empenhoCards.id)),
    // UMA agregação para todos os cards (a execução do que está gravado, no escopo da pessoa).
    db.all<{ c: number; n: number; emp: number; anu: number; liq: number; pag: number; sal: number; forn: number; ges: number; uo: number; ac: number }>(sql`
      SELECT e."card_id" AS c, COUNT(*) AS n, IFNULL(SUM(e."valor_empenhado"), 0) AS emp, IFNULL(SUM(e."valor_anulado"), 0) AS anu,
        IFNULL(SUM(e."valor_liquidado"), 0) AS liq, IFNULL(SUM(e."valor_pago"), 0) AS pag, IFNULL(SUM(e."saldo_pagar"), 0) AS sal,
        COUNT(DISTINCT e."cpf_cnpj") AS forn, COUNT(DISTINCT e."orgao_gestor") AS ges, COUNT(DISTINCT e."unidade_orcamentaria") AS uo,
        COUNT(DISTINCT e."acao") AS ac
      FROM "empenhos" e WHERE e."removido_em" IS NULL${id == null ? sql`` : sql` AND e."card_id" = ${id}`}${so} GROUP BY e."card_id"`),
  ]);
  const por = new Map(somas.map((x) => [Number(x.c), x]));
  return l.map((x) => {
    const s = por.get(x.card.id);
    return {
      ...paraCard(x.card),
      vinculos: Number(x.vinculos),
      lendo: !!Number(x.lendo),
      empenhos: Number(s?.n ?? 0),
      soma: Number(s?.emp ?? 0),
      anulado: Number(s?.anu ?? 0),
      liquidado: Number(s?.liq ?? 0),
      pago: Number(s?.pag ?? 0),
      saldoPagar: Number(s?.sal ?? 0),
      fornecedores: Number(s?.forn ?? 0),
      gestores: Number(s?.ges ?? 0),
      unidadesOrc: Number(s?.uo ?? 0),
      acoes: Number(s?.ac ?? 0),
    };
  });
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

/** Um órgão da Centi das LIQUIDAÇÕES do card: o id e o nome do órgão do cadastro que o tem. */
export type OrgaoLiquidacao = { id: number; nome: string };

/**
 * Os ÓRGÃOS da Centi que as LIQUIDAÇÕES do card pedem (a API exige o órgão): o "ID na Centi" dos órgãos de destino dos
 * vínculos. `semId` = os órgãos de destino sem o ID cadastrado (as liquidações deles não são lidas).
 */
export async function orgaosLiquidacao(cardId: number): Promise<{ orgaos: OrgaoLiquidacao[]; semId: string[] }> {
  const vs = await vinculosDoCard(cardId);
  const ids = [...new Set(vs.map((v) => v.orgaoId))];
  if (!ids.length) return { orgaos: [], semId: [] };
  const os = await getDb()
    .select({ id: orgaos.id, nome: orgaos.nome, sigla: orgaos.sigla, centi: orgaos.entidadeCenti })
    .from(orgaos)
    .where(sql`${orgaos.id} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`);
  const { ids: centi, semId } = orgaosCentiDoCard(vs, new Map(os.map((o) => [o.id, o.centi])));
  const nome = (o: (typeof os)[number]) => (o.sigla ? `${o.sigla} — ${o.nome}` : o.nome);
  return {
    orgaos: centi.map((id) => ({ id, nome: os.filter((o) => Number(o.centi) === id).map(nome).join(", ") })),
    semId: os.filter((o) => semId.includes(o.id)).map(nome),
  };
}
