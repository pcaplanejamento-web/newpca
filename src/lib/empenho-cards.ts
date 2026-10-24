import { and, asc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { empenhoCards, liquidacaoCardOrgaos, orgaos, reparticoes } from "@/db/schema";
import { getDb } from "./db";
import { type CardEmpenho, type EdicaoCard, lerAnos, lerRegraRemovidos, lerTipoCard, type ResumoCard, type TipoCard, type VinculoCard } from "./empenho-cards-core";
import { comandosCriarCard, consultaCatalogo, consultaVinculosCard } from "./empenho-cards-sql";
import type { EscopoEmpenhos } from "./empenhos-tela-core";
import { doEscopo } from "./empenhos-tela-sql";
import { type OrgaoDoCard, type PedidoLiquidacao, pedidosDoCard } from "./liquidacoes-core";
import { ORDEM_ORGAOS } from "./orgaos";

/** Os CARDS de EMPENHOS no D1 (leitura e edição). Os comandos em lote ficam em `empenho-cards-sql.ts`. */

type Linha = typeof empenhoCards.$inferSelect;

function paraCard(l: Linha): CardEmpenho {
  return { ...l, tipo: lerTipoCard(l.tipo), anos: lerAnos(l.anos), removidos: lerRegraRemovidos(l.removidos) };
}

/**
 * Os cards de UM TIPO com os números do que está gravado (no ESCOPO da pessoa): nos de empenhos, os empenhos vigentes e a
 * execução; nos de liquidações, as liquidações vigentes (o escopo é o da própria liquidação). Quantos vínculos (no de
 * liquidações, os ÓRGÃOS do card) e se há uma importação lendo agora.
 */
export async function listarCards(escopo: EscopoEmpenhos, tipo: TipoCard, id?: number): Promise<ResumoCard[]> {
  const so = (p: string) => (escopo === null ? sql`` : sql.join([sql.raw(" AND "), doEscopo(escopo, p)], sql.raw("")));
  const doId = id == null ? sql`` : sql` AND x."card_id" = ${id}`;
  const db = getDb();
  const [l, somas] = await Promise.all([
    db
      .select({
        card: empenhoCards,
        vinculos:
          tipo === "liquidacoes"
            ? sql<number>`(SELECT COUNT(*) FROM "liquidacao_card_orgaos" v WHERE v."card_id" = "empenho_cards"."id")`
            : sql<number>`(SELECT COUNT(*) FROM "empenho_card_vinculos" v WHERE v."card_id" = "empenho_cards"."id")`,
        lendo: sql<number>`EXISTS (SELECT 1 FROM "centi_lotes" l WHERE l."card_id" = "empenho_cards"."id" AND l."estado" = 'lendo')`,
      })
      .from(empenhoCards)
      .where(and(eq(empenhoCards.tipo, tipo), id == null ? undefined : eq(empenhoCards.id, id)))
      .orderBy(asc(empenhoCards.nome), asc(empenhoCards.id)),
    // UMA agregação para todos os cards do tipo (o que está gravado, no escopo da pessoa).
    tipo === "liquidacoes"
      ? db.all<{ c: number; n: number; emp: number; anu: number; liq: number; pag: number; sal: number; forn: number; ges: number; uo: number; ac: number }>(sql`
      SELECT x."card_id" AS c, COUNT(*) AS n, IFNULL(SUM(x."valor"), 0) AS emp, IFNULL(SUM(x."valor_anulado"), 0) AS anu,
        IFNULL(SUM(x."valor_liquido"), 0) AS liq, IFNULL(SUM(x."valor_pago"), 0) AS pag, IFNULL(SUM(x."saldo"), 0) AS sal,
        COUNT(DISTINCT x."cpf_cnpj") AS forn, COUNT(DISTINCT x."id_orgao_centi") AS ges, COUNT(DISTINCT x."reparticao_id") AS uo,
        COUNT(DISTINCT x."numero_empenho") AS ac
      FROM "liquidacoes" x WHERE x."removido_em" IS NULL${doId}${so("x.")} GROUP BY x."card_id"`)
      : db.all<{ c: number; n: number; emp: number; anu: number; liq: number; pag: number; sal: number; forn: number; ges: number; uo: number; ac: number }>(sql`
      SELECT e."card_id" AS c, COUNT(*) AS n, IFNULL(SUM(e."valor_empenhado"), 0) AS emp, IFNULL(SUM(e."valor_anulado"), 0) AS anu,
        IFNULL(SUM(e."valor_liquidado"), 0) AS liq, IFNULL(SUM(e."valor_pago"), 0) AS pag, IFNULL(SUM(e."saldo_pagar"), 0) AS sal,
        COUNT(DISTINCT e."cpf_cnpj") AS forn, COUNT(DISTINCT e."orgao_gestor") AS ges, COUNT(DISTINCT e."unidade_orcamentaria") AS uo,
        COUNT(DISTINCT e."acao") AS ac
      FROM "empenhos" e WHERE e."removido_em" IS NULL${id == null ? sql`` : sql` AND e."card_id" = ${id}`}${so("e.")} GROUP BY e."card_id"`),
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

/** Os cards ligados (a atualização automática) — só os CONFIGURADOS e com vínculos (`pendenciasDoCard`; no de
 * liquidações, com órgãos). */
export async function cardsAtivos(): Promise<CardEmpenho[]> {
  const l = await getDb()
    .select()
    .from(empenhoCards)
    .where(
      and(
        eq(empenhoCards.ativa, true),
        isNotNull(empenhoCards.configuradoEm),
        sql`CASE "empenho_cards"."tipo"
          WHEN 'liquidacoes' THEN EXISTS (SELECT 1 FROM "liquidacao_card_orgaos" v WHERE v."card_id" = "empenho_cards"."id")
          ELSE EXISTS (SELECT 1 FROM "empenho_card_vinculos" v WHERE v."card_id" = "empenho_cards"."id") END`,
      ),
    )
    .orderBy(asc(empenhoCards.id));
  return l.map(paraCard);
}

const valoresDaEdicao = (e: EdicaoCard) => ({ ...e, anos: JSON.stringify(e.anos) });

/** Cria o card do tipo (e copia os vínculos — ou os órgãos, no de liquidações — de `copiarDe`, do mesmo tipo) — devolve o id. */
export async function criarCard(e: EdicaoCard, copiarDe: number | null, quem: string, tipo: TipoCard = "empenhos"): Promise<number> {
  const db = getDb();
  const r = (await db.batch(comandosCriarCard(db, { ...valoresDaEdicao(e), criadoPor: quem, tipo }, copiarDe, tipo) as never)) as { id: number }[][];
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

/** Um órgão do cadastro nas escolhas (`centi` = o "ID na Centi" — o `idOrgao` das liquidações). */
export type OrgaoVinculo = { id: number; sigla: string; nome: string; centi: string | null };
export type UnidadeVinculo = { id: number; codigo: string; nome: string; orgaoId: number | null };

/** O cadastro que os vínculos escolhem: os órgãos e as unidades (sem as ocultas e sem a "Geral"). */
export async function cadastroParaVinculos(ocultos = false): Promise<{ orgaos: OrgaoVinculo[]; unidades: UnidadeVinculo[] }> {
  const db = getDb();
  const [o, u] = await Promise.all([
    db.select({ id: orgaos.id, sigla: orgaos.sigla, nome: orgaos.nome, centi: orgaos.entidadeCenti }).from(orgaos).where(ocultos ? undefined : eq(orgaos.oculto, false)).orderBy(...ORDEM_ORGAOS),
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

/** Os ÓRGÃOS de um card de liquidações, como gravados. */
export async function orgaosDoCard(cardId: number): Promise<OrgaoDoCard[]> {
  return getDb()
    .select({ orgaoId: liquidacaoCardOrgaos.orgaoId, reparticaoId: liquidacaoCardOrgaos.reparticaoId })
    .from(liquidacaoCardOrgaos)
    .where(eq(liquidacaoCardOrgaos.cardId, cardId))
    .orderBy(asc(liquidacaoCardOrgaos.id));
}

/** Um pedido de liquidações do card com o nome do órgão (a escolha na Importação) e a sigla (o botão). */
export type OrgaoLiquidacao = PedidoLiquidacao & { nome: string; sigla: string };

/**
 * Os PEDIDOS de um card de liquidações (a API exige o órgão — um por importação): cada órgão do card com o "ID na Centi"
 * dele (`idOrgao`) e o destino. `semId` = os órgãos do card sem o ID cadastrado (não são lidos).
 */
export async function orgaosLiquidacao(cardId: number): Promise<{ orgaos: OrgaoLiquidacao[]; semId: string[] }> {
  const doCard = await orgaosDoCard(cardId);
  if (!doCard.length) return { orgaos: [], semId: [] };
  const os = await getDb()
    .select({ id: orgaos.id, nome: orgaos.nome, sigla: orgaos.sigla, centi: orgaos.entidadeCenti })
    .from(orgaos)
    .where(sql`${orgaos.id} IN (SELECT value FROM json_each(${JSON.stringify(doCard.map((o) => o.orgaoId))}))`);
  const nome = new Map(os.map((o) => [o.id, o.sigla ? `${o.sigla} — ${o.nome}` : o.nome]));
  const sigla = new Map(os.map((o) => [o.id, o.sigla || o.nome]));
  const { pedidos, semId } = pedidosDoCard(doCard, new Map(os.map((o) => [o.id, o.centi])));
  return { orgaos: pedidos.map((p) => ({ ...p, nome: nome.get(p.orgaoId) ?? `#${p.orgaoId}`, sigla: sigla.get(p.orgaoId) ?? `#${p.orgaoId}` })), semId: semId.map((id) => nome.get(id) ?? `#${id}`) };
}

/** O cadastro como a regra dos órgãos de liquidações o confere (`motivoOrgaosInvalidos`). */
export async function cadastroDosOrgaos(): Promise<{ orgaos: Map<number, { nome: string; centi: string | null }>; unidades: Map<number, number | null> }> {
  const db = getDb();
  const [o, u] = await Promise.all([
    db.select({ id: orgaos.id, nome: orgaos.nome, centi: orgaos.entidadeCenti }).from(orgaos),
    db.select({ id: reparticoes.id, orgaoId: reparticoes.orgaoId }).from(reparticoes),
  ]);
  return { orgaos: new Map(o.map((x) => [x.id, { nome: x.nome, centi: x.centi }])), unidades: new Map(u.map((x) => [x.id, x.orgaoId])) };
}
