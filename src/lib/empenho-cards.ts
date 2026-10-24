import { and, asc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { empenhoCards, orgaos, reparticoes } from "@/db/schema";
import { getDb } from "./db";
import { type CardEmpenho, type EdicaoCard, lerAnos, lerRegraRemovidos, lerTipoCard, type ResumoCard, type TipoCard, type VinculoCard } from "./empenho-cards-core";
import { comandosCriarCard, consultaCatalogo, consultaVinculosCard } from "./empenho-cards-sql";
import type { EscopoEmpenhos } from "./empenhos-tela-core";
import { doEscopo } from "./empenhos-tela-sql";
import { idCenti, orgaosDaCenti } from "./liquidacoes-core";
import { ORDEM_ORGAOS } from "./orgaos";

/** Os CARDS de EMPENHOS no D1 (leitura e edição). Os comandos em lote ficam em `empenho-cards-sql.ts`. */

type Linha = typeof empenhoCards.$inferSelect;

/** Quantos órgãos do cadastro têm o "ID na Centi" — os que uma importação de liquidações lê (o "vínculo" do card). */
const ORGAOS_COM_ID = `(SELECT COUNT(DISTINCT CAST(TRIM(o."entidade_centi") AS INTEGER)) FROM "orgaos" o WHERE CAST(TRIM(o."entidade_centi") AS INTEGER) > 0)`;

function paraCard(l: Linha): CardEmpenho {
  return { ...l, tipo: lerTipoCard(l.tipo), anos: lerAnos(l.anos), removidos: lerRegraRemovidos(l.removidos) };
}

/**
 * Os cards de UM TIPO com os números do que está gravado (no ESCOPO da pessoa): nos de empenhos, os empenhos vigentes e a
 * execução; nos de liquidações, as liquidações vigentes (o escopo é o da própria liquidação). Quantos vínculos (no de
 * liquidações, os órgãos do cadastro com o "ID na Centi") e se há uma importação lendo agora.
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
            ? sql<number>`${sql.raw(ORGAOS_COM_ID)}`
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
 * liquidações, algum órgão do cadastro com o "ID na Centi"). */
export async function cardsAtivos(): Promise<CardEmpenho[]> {
  const l = await getDb()
    .select()
    .from(empenhoCards)
    .where(
      and(
        eq(empenhoCards.ativa, true),
        isNotNull(empenhoCards.configuradoEm),
        sql`CASE "empenho_cards"."tipo"
          WHEN 'liquidacoes' THEN ${sql.raw(ORGAOS_COM_ID)} > 0
          ELSE EXISTS (SELECT 1 FROM "empenho_card_vinculos" v WHERE v."card_id" = "empenho_cards"."id") END`,
      ),
    )
    .orderBy(asc(empenhoCards.id));
  return l.map(paraCard);
}

const valoresDaEdicao = (e: EdicaoCard) => ({ ...e, anos: JSON.stringify(e.anos) });

/** Cria o card do tipo (e, no de empenhos, copia os vínculos de `copiarDe`) — devolve o id. */
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

/** Um órgão da Centi das liquidações: o "ID na Centi" (o `idOrgao` do pedido) e o órgão do cadastro que o tem. */
export type OrgaoLiquidacao = { idOrgao: number; orgaoId: number; nome: string; sigla: string };

/**
 * Os ÓRGÃOS da Centi que uma importação de liquidações lê: TODOS os do cadastro com o "ID na Centi" (Órgãos e Unidades),
 * um por ID (o de menor id no cadastro), na ordem do ID.
 */
export async function orgaosLiquidacao(): Promise<OrgaoLiquidacao[]> {
  const os = await getDb().select({ id: orgaos.id, nome: orgaos.nome, sigla: orgaos.sigla, centi: orgaos.entidadeCenti }).from(orgaos).orderBy(asc(orgaos.id));
  const por = new Map<number, OrgaoLiquidacao>();
  for (const o of os) {
    const id = idCenti(o.centi);
    if (id != null && !por.has(id)) por.set(id, { idOrgao: id, orgaoId: o.id, nome: o.sigla ? `${o.sigla} — ${o.nome}` : o.nome, sigla: o.sigla || o.nome });
  }
  return orgaosDaCenti([...por.keys()].map(String)).map((id) => por.get(id) as OrgaoLiquidacao);
}
