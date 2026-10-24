import { and, count, desc, eq, isNull, ne, notInArray, or, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { centiLotePassos, centiLotes, centiStagingFora, pagamentos, pagamentosStaging } from "../db/schema.ts";
import type { RegraRemovidos } from "./empenho-cards-core.ts";
import { chavesIguais, MAX_JSON_GUARDA, ultimoPasso } from "./empenhos-sql.ts";
import { destinoSql } from "./liquidacoes-sql.ts";
import { LIMITE_VALOR_PAGAMENTO, type LinhaPagamento } from "./pagamentos-core.ts";

/**
 * PAGAMENTOS — os comandos da importação como BUILDERS do Drizzle (testados pelo driver D1 REAL — `tests/pagamentos.test.ts`),
 * os MESMOS das liquidações (`liquidacoes-sql.ts`): a página num ÚNICO parâmetro JSON, a conferência em tempo real e a
 * promoção num lote atômico. O DESTINO de cada pagamento (o órgão e a unidade do cadastro) é o do EMPENHO de mesmo NÚMERO
 * (`destinoSql`) — sem ele, o órgão do cadastro com o "ID na Centi" do pagamento, sem unidade. O fecho do período em paralelo
 * é o das liquidações (`comandosFechoPeriodoLiquidacoes` — só os passos).
 */
type Db = DrizzleD1Database<typeof schema>;

const CAMPOS = [
  "chave",
  "ano",
  "srcId",
  "data",
  "numeroEmpenho",
  "orgao",
  "credor",
  "cpfCnpj",
  "historico",
  "valor",
  "valorRetencao",
  "valorLiquido",
  "anulado",
  "motivoAnulacao",
] as const satisfies readonly (keyof LinhaPagamento)[];

const colunaSql = (c: string) => c.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

/** Guarda os pagamentos da página (de UM órgão da Centi) no STAGING, em pedaços de JSON. */
export function comandosGuardarPagamentos(db: Db, loteId: number, pagina: number, idOrgao: number, linhas: LinhaPagamento[]) {
  const pedacos: string[][] = [];
  let atual: string[] = [];
  let tamanho = 0;
  for (const l of linhas) {
    const j = JSON.stringify(CAMPOS.map((c) => l[c]));
    if (atual.length && tamanho + j.length > MAX_JSON_GUARDA) {
      pedacos.push(atual);
      atual = [];
      tamanho = 0;
    }
    atual.push(j);
    tamanho += j.length + 1;
  }
  if (atual.length) pedacos.push(atual);
  return pedacos.map((p) => {
    const sel = db
      .select({
        loteId: sql<number>`${loteId}`.as("lote_id"),
        pagina: sql<number>`${pagina}`.as("pagina"),
        ...Object.fromEntries(CAMPOS.map((c, i) => [c, sql`json_extract(value, ${`$[${i}]`})`.as(c)])),
        idOrgaoCenti: sql<number>`${idOrgao}`.as("id_orgao_centi"),
      })
      .from(sql`json_each(${`[${p.join(",")}]`})`)
      .where(sql`1`);
    return db.insert(pagamentosStaging).select(sel as never).onConflictDoNothing();
  });
}

const DESTINO = destinoSql("pagamentos_staging");

/** O empenho de mesmo número (a régua de `destinoSql`). */
const doEmpenho = (num: SQL, col: "orgao_id" | "reparticao_id") =>
  sql`(SELECT e.${sql.raw(`"${col}"`)} FROM "empenhos" e WHERE e."numero" = ${num} AND e."orgao_id" IS NOT NULL ORDER BY e."removido_em" IS NOT NULL, e."reparticao_id" IS NULL, e."id" LIMIT 1)`;
const temEmpenho = (num: SQL) => sql`EXISTS (SELECT 1 FROM "empenhos" e WHERE e."numero" = ${num} AND e."orgao_id" IS NOT NULL)`;

/**
 * REALINHA os pagamentos gravados ao EMPENHO de mesmo número (o órgão e a unidade dele) — no MESMO lote em que as
 * liquidações realinham (a promoção de empenhos e a troca dos vínculos de um card de empenhos).
 */
export function comandoRealinharPagamentos(db: Db) {
  const num = sql.raw(`"pagamentos"."numero_empenho"`);
  return db
    .update(pagamentos)
    .set({ orgaoId: sql`${doEmpenho(num, "orgao_id")}`, reparticaoId: sql`${doEmpenho(num, "reparticao_id")}`, atualizadoEm: sql`CURRENT_TIMESTAMP` })
    .where(and(temEmpenho(num), sql`(${pagamentos.orgaoId} IS NOT ${doEmpenho(num, "orgao_id")} OR ${pagamentos.reparticaoId} IS NOT ${doEmpenho(num, "reparticao_id")})`));
}

const chavesDoLote = (db: Db, loteId: number) => db.select({ c: pagamentosStaging.chave }).from(pagamentosStaging).where(eq(pagamentosStaging.loteId, loteId));

/** Os pagamentos do card, do ano e dos órgãos da Centi do lote que a Centi não trouxe mais. */
const sumiram = (db: Db, loteId: number, card: number, ano: number, orgaos: readonly number[]) =>
  and(
    eq(pagamentos.cardId, card),
    eq(pagamentos.ano, ano),
    sql`${pagamentos.idOrgaoCenti} IN (SELECT value FROM json_each(${JSON.stringify(orgaos)}))`,
    isNull(pagamentos.removidoEm),
    notInArray(pagamentos.chave, chavesDoLote(db, loteId)),
    notInArray(pagamentos.chave, chavesIguais(db, loteId)),
  );

const COMPARADOS = [...CAMPOS.filter((c) => c !== "chave"), "idOrgaoCenti"];
const colPag = (c: string) => sql.raw(`"pagamentos"."${colunaSql(c)}"`);
const colStg = (c: string) => sql.raw(`"pagamentos_staging"."${colunaSql(c)}"`);

/** "Mudou": algum campo diferente, o DESTINO mudou (o empenho ganhou outra unidade, ou chegou), estava removida ou outro leitor. */
function mudou(atual: (c: string) => SQL, novo: (c: string) => SQL, leitorNovo: SQL, orgaoNovo: SQL, unidadeNovo: SQL): SQL {
  return sql.join(
    [
      ...COMPARADOS.map((c) => sql`${atual(c)} IS NOT ${novo(c)}`),
      sql`${atual("orgaoId")} IS NOT ${orgaoNovo}`,
      sql`${atual("reparticaoId")} IS NOT ${unidadeNovo}`,
      sql`${atual("removidoEm")} IS NOT NULL`,
      sql`${atual("leitor")} IS NOT ${leitorNovo}`,
    ],
    sql` OR `,
  );
}

/** O resumo da promoção: novas, atualizadas de fato, removidas (não vieram mais) e FORA = sem destino (nem o empenho
 * no sistema nem um órgão do cadastro com o ID na Centi — não gravadas). */
export async function contagemPagamentos(db: Db, loteId: number, card: number, ano: number, orgaos: readonly number[], leitor: number) {
  const doLote = and(eq(pagamentosStaging.loteId, loteId), sql`${DESTINO.orgao} IS NOT NULL`);
  const [novos] = await db
    .select({ n: count() })
    .from(pagamentosStaging)
    .where(and(doLote, sql`NOT EXISTS (SELECT 1 FROM ${pagamentos} WHERE ${pagamentos.cardId} = ${card} AND ${pagamentos.chave} = ${pagamentosStaging.chave})`));
  const [alterados] = await db
    .select({ n: count() })
    .from(pagamentosStaging)
    .innerJoin(pagamentos, and(eq(pagamentos.cardId, card), eq(pagamentos.chave, pagamentosStaging.chave)))
    .where(and(doLote, mudou(colPag, colStg, sql`${leitor}`, DESTINO.orgao, DESTINO.unidade)));
  const [fora] = await db
    .select({ n: count() })
    .from(pagamentosStaging)
    .where(and(eq(pagamentosStaging.loteId, loteId), sql`${DESTINO.orgao} IS NULL`));
  const [removidos] = await db.select({ n: count() }).from(pagamentos).where(sumiram(db, loteId, card, ano, orgaos));
  return { inseridos: novos.n, atualizados: alterados.n, removidos: removidos.n, fora: fora.n };
}

/**
 * A CONFERÊNCIA EM TEMPO REAL de uma página de PAGAMENTOS (a mesma das liquidações — `comandosConferirLiquidacoes`): compara
 * cada pagamento guardado da página com a GRAVADA no card pela régua da promoção (`mudou`, com o destino pelo empenho e
 * o leitor), grava o RESULTADO no passo e tira do staging as IGUAIS (fica só a chave). Sem destino = "sem vínculo".
 */
export function comandosConferirPagamentos(db: Db, loteId: number, card: number, leitor: number, chaves: readonly string[]) {
  const lista = sql`(SELECT value FROM json_each(${JSON.stringify(chaves)}))`;
  const daPagina = sql`"pagamentos_staging"."lote_id" = ${loteId} AND "pagamentos_staging"."chave" IN ${lista}`;
  const juntos = sql`"pagamentos_staging" JOIN "pagamentos" ON "pagamentos"."card_id" = ${card} AND "pagamentos"."chave" = "pagamentos_staging"."chave"`;
  const difere = mudou(colPag, colStg, sql`${leitor}`, DESTINO.orgao, DESTINO.unidade);
  const comDestino = sql`${DESTINO.orgao} IS NOT NULL`;
  return [
    db
      .update(centiLotePassos)
      .set({
        resNovos: sql`(SELECT COUNT(*) FROM "pagamentos_staging" WHERE ${daPagina} AND ${comDestino} AND NOT EXISTS (SELECT 1 FROM "pagamentos" WHERE "pagamentos"."card_id" = ${card} AND "pagamentos"."chave" = "pagamentos_staging"."chave"))`,
        resAlterados: sql`(SELECT COUNT(*) FROM ${juntos} WHERE ${daPagina} AND ${comDestino} AND (${difere}))`,
        resIguais: sql`(SELECT COUNT(*) FROM ${juntos} WHERE ${daPagina} AND ${comDestino} AND NOT (${difere}))`,
        resSemVinculo: sql`(SELECT COUNT(*) FROM "pagamentos_staging" WHERE ${daPagina} AND NOT (${comDestino}))`,
      })
      .where(eq(centiLotePassos.id, ultimoPasso(loteId))),
    db.delete(centiStagingFora).where(and(eq(centiStagingFora.loteId, loteId), eq(centiStagingFora.igual, 1), sql`${centiStagingFora.chave} IN ${lista}`)),
    db
      .insert(centiStagingFora)
      .select(
        db
          .select({ loteId: sql<number>`${loteId}`.as("lote_id"), chave: sql<string>`"pagamentos_staging"."chave"`.as("chave"), igual: sql<number>`1`.as("igual") })
          .from(juntos)
          .where(sql`${daPagina} AND ${comDestino} AND NOT (${difere})`) as never,
      )
      .onConflictDoNothing(),
    db.delete(pagamentosStaging).where(
      and(
        eq(pagamentosStaging.loteId, loteId),
        sql`${pagamentosStaging.chave} IN ${lista}`,
        sql`EXISTS (SELECT 1 FROM "centi_staging_fora" f WHERE f."lote_id" = ${loteId} AND f."chave" = "pagamentos_staging"."chave" AND f."igual" = 1)`,
      ),
    ),
  ] as const;
}

const VALORES = ["valor", "valorRetencao", "valorLiquido"] as const;

/** Quantos pagamentos do lote têm valor SUSPEITO (negativo ou acima do limite) — a conclusão não promove. */
export async function pagamentosSuspeitos(db: Db, loteId: number): Promise<number> {
  const fora = (c: (typeof pagamentosStaging)[(typeof VALORES)[number]]) => sql`(${c} < 0 OR ${c} > ${LIMITE_VALOR_PAGAMENTO})`;
  const [r] = await db
    .select({ n: count() })
    .from(pagamentosStaging)
    .where(and(eq(pagamentosStaging.loteId, loteId), or(...VALORES.map((v) => fora(pagamentosStaging[v])))));
  return r?.n ?? 0;
}

/** A última importação de pagamentos CONCLUÍDA do mesmo card e ano (a base da conferência de queda). */
export async function ultimoPagamentoPromovido(db: Db, card: number, ano: number, exceto: number) {
  const [l] = await db
    .select({ soma: centiLotes.soma, unicos: centiLotes.unicos })
    .from(centiLotes)
    .where(
      and(
        eq(centiLotes.cardId, card),
        eq(centiLotes.ano, ano),
        eq(centiLotes.modo, "pagamentos"),
        eq(centiLotes.estado, "promovido"),
        ne(centiLotes.id, exceto),
      ),
    )
    .orderBy(desc(centiLotes.id))
    .limit(1);
  return l ?? null;
}

/**
 * PROMOVE o lote de pagamentos conferido, num lote ATÔMICO: grava/atualiza os pagamentos com o DESTINO de cada um (o
 * órgão e a unidade do EMPENHO de mesmo número — sem destino, não entram), trata os que a Centi não trouxe mais (do mesmo
 * ano e dos órgãos do lote) pela REGRA do card, fecha o lote e limpa o staging.
 */
export function comandosPromoverPagamentos(
  db: Db,
  loteId: number,
  card: number,
  ano: number,
  orgaos: readonly number[],
  leitor: number,
  regra: RegraRemovidos,
  contagem: { inseridos: number; atualizados: number; removidos: number; fora: number },
) {
  const sel = db
    .select({
      id: sql<number>`NULL`.as("id"),
      ...Object.fromEntries(CAMPOS.map((c) => [c, pagamentosStaging[c]])),
      idOrgaoCenti: pagamentosStaging.idOrgaoCenti,
      orgaoId: sql<number>`${DESTINO.orgao}`.as("orgao_id"),
      reparticaoId: sql<number | null>`${DESTINO.unidade}`.as("reparticao_id"),
      cardId: sql<number>`${card}`.as("card_id"),
      loteId: pagamentosStaging.loteId,
      removidoEm: sql<string | null>`NULL`.as("removido_em"),
      leitor: sql<number>`${leitor}`.as("leitor"),
      criadoEm: sql<string>`CURRENT_TIMESTAMP`.as("criado_em"),
      atualizadoEm: sql<string>`CURRENT_TIMESTAMP`.as("atualizado_em"),
    })
    .from(pagamentosStaging)
    .where(and(eq(pagamentosStaging.loteId, loteId), sql`${DESTINO.orgao} IS NOT NULL`));
  const atualizar = Object.fromEntries([...COMPARADOS, "orgaoId", "reparticaoId", "loteId", "removidoEm", "leitor"].map((c) => [c, sql.raw(`excluded.${colunaSql(c)}`)]));
  return [
    db
      .insert(pagamentos)
      .select(sel as never)
      .onConflictDoUpdate({
        target: [pagamentos.cardId, pagamentos.chave],
        set: { ...atualizar, atualizadoEm: sql`CURRENT_TIMESTAMP` },
        setWhere: mudou(colPag, (c) => sql.raw(`excluded."${colunaSql(c)}"`), sql`excluded."leitor"`, sql`excluded."orgao_id"`, sql`excluded."reparticao_id"`),
      }),
    regra === "apagar"
      ? db.delete(pagamentos).where(sumiram(db, loteId, card, ano, orgaos))
      : db.update(pagamentos).set({ removidoEm: sql`CURRENT_TIMESTAMP`, atualizadoEm: sql`CURRENT_TIMESTAMP` }).where(sumiram(db, loteId, card, ano, orgaos)),
    db
      .update(centiLotes)
      .set({ estado: "promovido", ...contagem, mensagem: null, condutor: null, conduzindoAte: null, concluidoEm: sql`CURRENT_TIMESTAMP`, vistoEm: sql`CURRENT_TIMESTAMP` })
      .where(eq(centiLotes.id, loteId)),
    db.delete(pagamentosStaging).where(eq(pagamentosStaging.loteId, loteId)),
    db.delete(centiStagingFora).where(eq(centiStagingFora.loteId, loteId)),
  ] as const;
}

