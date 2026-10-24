import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { centiCatalogo, empenhoCards, empenhoCardVinculos, empenhos } from "../db/schema.ts";
import type { ItemCatalogo, VinculoCard } from "./empenho-cards-core.ts";

/**
 * Os CARDS de EMPENHOS no banco — BUILDERS do Drizzle (testados no driver D1 REAL sobre `node:sqlite`, dentro de
 * `db.batch` — `tests/empenho-cards.test.ts`). Os vínculos vão em INSERTs de 14 linhas (≤ 100 parâmetros do D1); o
 * catálogo de uma página, num parâmetro JSON (`json_each`).
 */
type Db = DrizzleD1Database<typeof schema>;

const LINHAS_POR_INSERT = 14;
const agoraIso = sql`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

/**
 * O VÍNCULO de um registro (empenho gravado ou do staging) pelos vínculos do card — o MAIS ESPECÍFICO (a ação › a unidade
 * orçamentária › o órgão gestor inteiro): a MESMA régua de `vinculoDaLinha` e da migração `0143`. `orgao` nulo = sem
 * vínculo. `card` = o id do card (inteiro conferido) ou a coluna da própria linha.
 */
export function vinculoSql(tabela: "empenhos" | "empenhos_staging", card: number | "coluna"): { orgao: SQL; reparticao: SQL } {
  const T = `"${tabela}"`;
  const c = card === "coluna" ? `${T}."card_id"` : String(Math.trunc(card));
  const sub = (col: string) =>
    `(SELECT v."${col}" FROM "empenho_card_vinculos" v WHERE v."card_id" = ${c} AND v."orgao_gestor" = ${T}."orgao_gestor" AND (v."unidade" IS NULL OR v."unidade" = IFNULL(${T}."unidade_orcamentaria", '')) AND (v."acao" IS NULL OR v."acao" = IFNULL(${T}."acao", '')) ORDER BY v."acao" IS NULL, v."unidade" IS NULL LIMIT 1)`;
  return { orgao: sql.raw(sub("orgao_id")), reparticao: sql.raw(sub("reparticao_id")) };
}

/** Os vínculos do card, como gravados. */
export async function consultaVinculosCard(db: Db, cardId: number): Promise<VinculoCard[]> {
  return db
    .select({
      orgaoGestor: empenhoCardVinculos.orgaoGestor,
      unidade: empenhoCardVinculos.unidade,
      acao: empenhoCardVinculos.acao,
      orgaoId: empenhoCardVinculos.orgaoId,
      reparticaoId: empenhoCardVinculos.reparticaoId,
    })
    .from(empenhoCardVinculos)
    .where(eq(empenhoCardVinculos.cardId, cardId))
    .orderBy(asc(empenhoCardVinculos.orgaoGestor), asc(empenhoCardVinculos.unidade), asc(empenhoCardVinculos.acao));
}

/**
 * REFAZ o vínculo dos empenhos do card pelos vínculos atuais, num lote: o que ficou SEM vínculo sai do banco; os demais
 * acompanham o órgão/unidade.
 */
export function comandosRefazerEmpenhosCard(db: Db, cardId: number) {
  const v = vinculoSql("empenhos", cardId);
  return [
    db.delete(empenhos).where(and(eq(empenhos.cardId, cardId), sql`${v.orgao} IS NULL`)),
    db
      .update(empenhos)
      .set({ orgaoId: sql`${v.orgao}`, reparticaoId: sql`${v.reparticao}` })
      .where(and(eq(empenhos.cardId, cardId), sql`("empenhos"."orgao_id" IS NOT ${v.orgao} OR "empenhos"."reparticao_id" IS NOT ${v.reparticao})`)),
  ] as const;
}

/**
 * GRAVA os vínculos do card (a lista INTEIRA — conferida antes por `motivoVinculosInvalidos`), num lote ATÔMICO: apaga os
 * de antes, insere os novos, refaz o vínculo dos empenhos (o que ficou sem vínculo sai) e marca a data dos vínculos.
 */
export function comandosGravarVinculos(db: Db, cardId: number, vs: readonly VinculoCard[]) {
  const inserts = [];
  for (let i = 0; i < vs.length; i += LINHAS_POR_INSERT) {
    inserts.push(db.insert(empenhoCardVinculos).values(vs.slice(i, i + LINHAS_POR_INSERT).map((v) => ({ cardId, ...v }))));
  }
  return [
    db.delete(empenhoCardVinculos).where(eq(empenhoCardVinculos.cardId, cardId)),
    ...inserts,
    ...comandosRefazerEmpenhosCard(db, cardId),
    db.update(empenhoCards).set({ vinculosEm: agoraIso, atualizadoEm: sql`CURRENT_TIMESTAMP` }).where(eq(empenhoCards.id, cardId)),
  ];
}

/**
 * CRIA o card (já com a configuração) e, com `copiarDe`, COPIA os vínculos daquele card — num lote só: o card novo é o
 * `MAX(id)` (o lote do D1 é uma transação sequencial).
 */
export function comandosCriarCard(db: Db, valores: typeof empenhoCards.$inferInsert, copiarDe: number | null, tipo: "empenhos" | "liquidacoes" = "empenhos") {
  const novo = sql<number>`(SELECT MAX("id") FROM "empenho_cards")`;
  return [
    db.insert(empenhoCards).values({ ...valores, vinculosEm: agoraIso }),
    ...(copiarDe == null || tipo === "liquidacoes"
      ? []
      : [
          db.insert(empenhoCardVinculos).select(
            db
              .select({
                id: sql<null>`NULL`.as("id"),
                cardId: novo.as("card_id"),
                orgaoGestor: empenhoCardVinculos.orgaoGestor,
                unidade: empenhoCardVinculos.unidade,
                acao: empenhoCardVinculos.acao,
                orgaoId: empenhoCardVinculos.orgaoId,
                reparticaoId: empenhoCardVinculos.reparticaoId,
              })
              .from(empenhoCardVinculos)
              .where(eq(empenhoCardVinculos.cardId, copiarDe)) as never,
          ),
          ]),
    db.select({ id: novo.as("id") }).from(empenhoCards).limit(1),
  ];
}

/**
 * REGISTRA o CATÁLOGO de uma página lida (`[órgão gestor, unidade, ação, registros]`): o novo entra; o conhecido soma os
 * registros desta leitura (zera ao ser visto por outro lote) e guarda o ano mais recente.
 */
export function comandoRegistrarCatalogo(db: Db, loteId: number, ano: number, quadras: [string, string, string, number][]) {
  const sel = db
    .select({
      id: sql<null>`NULL`.as("id"),
      orgaoGestor: sql<string>`json_extract(value, '$[0]')`.as("orgao_gestor"),
      unidade: sql<string>`json_extract(value, '$[1]')`.as("unidade"),
      acao: sql<string>`json_extract(value, '$[2]')`.as("acao"),
      registros: sql<number>`json_extract(value, '$[3]')`.as("registros"),
      ultimoLote: sql<number>`${loteId}`.as("ultimo_lote"),
      ultimoAno: sql<number>`${ano}`.as("ultimo_ano"),
      vistoEm: sql<string>`CURRENT_TIMESTAMP`.as("visto_em"),
    })
    .from(sql`json_each(${JSON.stringify(quadras)})`)
    // O WHERE desfaz a ambiguidade do SQLite entre "SELECT … ON CONFLICT" e a junção (exigido no upsert com SELECT).
    .where(sql`1`);
  const C = (c: string) => sql.raw(`"centi_catalogo"."${c}"`);
  return db
    .insert(centiCatalogo)
    .select(sel as never)
    .onConflictDoUpdate({
      target: [centiCatalogo.orgaoGestor, centiCatalogo.unidade, centiCatalogo.acao],
      set: {
        registros: sql`CASE WHEN ${C("ultimo_lote")} IS excluded.ultimo_lote THEN ${C("registros")} + excluded.registros ELSE excluded.registros END`,
        ultimoLote: sql`excluded.ultimo_lote`,
        ultimoAno: sql`MAX(IFNULL(${C("ultimo_ano")}, 0), excluded.ultimo_ano)`,
        vistoEm: sql`CURRENT_TIMESTAMP`,
      },
    });
}

/** O catálogo inteiro (a base das escolhas dos vínculos), pelo órgão gestor, unidade e ação. */
export async function consultaCatalogo(db: Db): Promise<ItemCatalogo[]> {
  return db
    .select({ orgaoGestor: centiCatalogo.orgaoGestor, unidade: centiCatalogo.unidade, acao: centiCatalogo.acao, registros: centiCatalogo.registros, ultimoAno: centiCatalogo.ultimoAno })
    .from(centiCatalogo)
    .orderBy(asc(centiCatalogo.orgaoGestor), asc(centiCatalogo.unidade), asc(centiCatalogo.acao));
}

