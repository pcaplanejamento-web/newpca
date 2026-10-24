import { and, asc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { empenhoCards, liquidacoes, orgaos, reparticoes } from "@/db/schema";
import { getDb } from "./db";
import { type CardEmpenho, type EdicaoCard, lerAnos, lerRegraRemovidos, lerTipoCard, type ResumoCard, type TipoCard, type VinculoCard } from "./empenho-cards-core";
import { comandosCriarCard, consultaCatalogo, consultaVinculosCard } from "./empenho-cards-sql";
import type { EscopoEmpenhos } from "./empenhos-tela-core";
import { doEscopo } from "./empenhos-tela-sql";
import { orgaosCentiDoCard } from "./liquidacoes-core";
import { ORDEM_ORGAOS } from "./orgaos";

/** Os CARDS de EMPENHOS no D1 (leitura e edição). Os comandos em lote ficam em `empenho-cards-sql.ts`. */

type Linha = typeof empenhoCards.$inferSelect;

function paraCard(l: Linha): CardEmpenho {
  return { ...l, tipo: lerTipoCard(l.tipo), anos: lerAnos(l.anos), removidos: lerRegraRemovidos(l.removidos) };
}

/**
 * Os cards de UM TIPO com os números do que está gravado (no ESCOPO da pessoa): nos de empenhos, os empenhos vigentes e a
 * execução; nos de liquidações, as liquidações vigentes (o escopo é o do empenho de cada uma). Quantos vínculos (no de
 * liquidações, os do card de empenhos de origem) e se há uma importação lendo agora.
 */
export async function listarCards(escopo: EscopoEmpenhos, tipo: TipoCard, id?: number): Promise<ResumoCard[]> {
  const so = escopo === null ? sql`` : sql.join([sql.raw(" AND "), doEscopo(escopo, "e.")], sql.raw(""));
  const doId = id == null ? sql`` : sql` AND x."card_id" = ${id}`;
  const db = getDb();
  const [l, somas] = await Promise.all([
    db
      .select({
        card: empenhoCards,
        vinculos: sql<number>`(SELECT COUNT(*) FROM "empenho_card_vinculos" v WHERE v."card_id" = IFNULL("empenho_cards"."origem_id", "empenho_cards"."id"))`,
        lendo: sql<number>`EXISTS (SELECT 1 FROM "centi_lotes" l WHERE l."card_id" = "empenho_cards"."id" AND l."estado" = 'lendo')`,
        origemNome: sql<string | null>`(SELECT o."nome" FROM "empenho_cards" o WHERE o."id" = "empenho_cards"."origem_id")`,
      })
      .from(empenhoCards)
      .where(and(eq(empenhoCards.tipo, tipo), id == null ? undefined : eq(empenhoCards.id, id)))
      .orderBy(asc(empenhoCards.nome), asc(empenhoCards.id)),
    // UMA agregação para todos os cards do tipo (o que está gravado, no escopo da pessoa).
    tipo === "liquidacoes"
      ? db.all<{ c: number; n: number; emp: number; anu: number; liq: number; pag: number; sal: number; forn: number; ges: number; uo: number; ac: number }>(sql`
      SELECT x."card_id" AS c, COUNT(*) AS n, IFNULL(SUM(x."valor"), 0) AS emp, IFNULL(SUM(x."valor_anulado"), 0) AS anu,
        IFNULL(SUM(x."valor_liquido"), 0) AS liq, IFNULL(SUM(x."valor_pago"), 0) AS pag, IFNULL(SUM(x."saldo"), 0) AS sal,
        COUNT(DISTINCT x."cpf_cnpj") AS forn, COUNT(DISTINCT x."orgao") AS ges, COUNT(DISTINCT e."unidade_orcamentaria") AS uo,
        COUNT(DISTINCT x."empenho_id") AS ac
      FROM "liquidacoes" x JOIN "empenhos" e ON e."id" = x."empenho_id" WHERE x."removido_em" IS NULL${doId}${so} GROUP BY x."card_id"`)
      : db.all<{ c: number; n: number; emp: number; anu: number; liq: number; pag: number; sal: number; forn: number; ges: number; uo: number; ac: number }>(sql`
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
      origemNome: x.origemNome ?? null,
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

/** Os cards ligados (a atualização automática) — só os CONFIGURADOS e com vínculos (`pendenciasDoCard`; no de
 * liquidações, com o card de origem e os vínculos dele). */
export async function cardsAtivos(): Promise<CardEmpenho[]> {
  const l = await getDb()
    .select()
    .from(empenhoCards)
    .where(
      and(
        eq(empenhoCards.ativa, true),
        isNotNull(empenhoCards.configuradoEm),
        sql`("empenho_cards"."tipo" = 'empenhos' OR "empenho_cards"."origem_id" IS NOT NULL)`,
        sql`EXISTS (SELECT 1 FROM "empenho_card_vinculos" v WHERE v."card_id" = IFNULL("empenho_cards"."origem_id", "empenho_cards"."id"))`,
      ),
    )
    .orderBy(asc(empenhoCards.id));
  return l.map(paraCard);
}

const valoresDaEdicao = (e: EdicaoCard) => ({ ...e, anos: JSON.stringify(e.anos) });

/** Cria o card do tipo (e copia os vínculos de `copiarDe`, quando escolhido — só nos de empenhos) — devolve o id. */
export async function criarCard(e: EdicaoCard, copiarDe: number | null, quem: string, tipo: TipoCard = "empenhos"): Promise<number> {
  const db = getDb();
  const r = (await db.batch(comandosCriarCard(db, { ...valoresDaEdicao(e), criadoPor: quem, tipo }, tipo === "empenhos" ? copiarDe : null) as never)) as { id: number }[][];
  return Number(r[r.length - 1][0]?.id);
}

/**
 * Grava a configuração. `trocouOrigem` (card de liquidações): as liquidações gravadas são de empenhos do card ANTERIOR —
 * saem no MESMO lote (a próxima importação lê de novo pela origem nova).
 */
export async function atualizarCard(id: number, e: EdicaoCard, trocouOrigem = false): Promise<void> {
  const db = getDb();
  const gravar = db
    .update(empenhoCards)
    .set({ ...valoresDaEdicao(e), atualizadoEm: sql`CURRENT_TIMESTAMP`, configuradoEm: sql`CURRENT_TIMESTAMP` })
    .where(eq(empenhoCards.id, id));
  if (trocouOrigem) await db.batch([gravar, db.delete(liquidacoes).where(eq(liquidacoes.cardId, id))]);
  else await gravar;
}

/** Os cards de EMPENHOS (a escolha da origem de um card de liquidações): id, nome e quantos vínculos. */
export async function cardsDeEmpenhos(): Promise<{ id: number; nome: string; vinculos: number }[]> {
  const l = await getDb()
    .select({ id: empenhoCards.id, nome: empenhoCards.nome, vinculos: sql<number>`(SELECT COUNT(*) FROM "empenho_card_vinculos" v WHERE v."card_id" = "empenho_cards"."id")` })
    .from(empenhoCards)
    .where(eq(empenhoCards.tipo, "empenhos"))
    .orderBy(asc(empenhoCards.nome), asc(empenhoCards.id));
  return l.map((x) => ({ ...x, vinculos: Number(x.vinculos) }));
}

/** Os cards de LIQUIDAÇÕES que leem os empenhos de um card (o aviso ao excluir o card de empenhos). */
export async function liquidacoesDaOrigem(origemId: number): Promise<{ id: number; nome: string }[]> {
  return getDb().select({ id: empenhoCards.id, nome: empenhoCards.nome }).from(empenhoCards).where(eq(empenhoCards.origemId, origemId));
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
 * Os ÓRGÃOS da Centi que um card de LIQUIDAÇÕES pede (a API exige o órgão): o "ID na Centi" dos órgãos de destino dos
 * vínculos do card de EMPENHOS de origem. `semId` = os órgãos de destino sem o ID cadastrado (não são lidos).
 */
export async function orgaosLiquidacao(card: Pick<CardEmpenho, "id" | "origemId">): Promise<{ orgaos: OrgaoLiquidacao[]; semId: string[] }> {
  if (card.origemId == null) return { orgaos: [], semId: [] };
  const vs = await vinculosDoCard(card.origemId);
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
