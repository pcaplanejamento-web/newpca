import { and, count, desc, eq, isNull, ne, notInArray, or, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { centiLotePassos, centiLotes, centiStagingFora, liquidacoes, liquidacoesStaging } from "../db/schema.ts";
import type { RegraRemovidos } from "./empenho-cards-core.ts";
import { chavesIguais, MAX_JSON_GUARDA, ultimoPasso } from "./empenhos-sql.ts";
import { LIMITE_VALOR_LIQUIDACAO, type LinhaLiquidacao, type OrgaoDoCard } from "./liquidacoes-core.ts";

/**
 * LIQUIDAÇÕES — os comandos da importação como BUILDERS do Drizzle (testados pelo driver D1 REAL — `tests/liquidacoes.test.ts`),
 * no MESMO padrão dos empenhos (`empenhos-sql.ts`): a página num ÚNICO parâmetro JSON, a promoção num lote atômico. As
 * liquidações são INDEPENDENTES dos empenhos: o lote é de UM órgão da Centi e tudo o que ele trouxe vai para o DESTINO do
 * órgão no card (`OrgaoDoCard` — o órgão e a unidade do cadastro).
 */
type Db = DrizzleD1Database<typeof schema>;

const CAMPOS = [
  "chave",
  "ano",
  "srcId",
  "numero",
  "data",
  "numeroEmpenho",
  "orgao",
  "credor",
  "cpfCnpj",
  "historico",
  "valor",
  "valorAnulado",
  "valorLiquido",
  "valorPago",
  "saldo",
] as const satisfies readonly (keyof LinhaLiquidacao)[];

const colunaSql = (c: string) => c.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

/** Guarda as liquidações da página no STAGING, em pedaços de JSON. */
export function comandosGuardarLiquidacoes(db: Db, loteId: number, pagina: number, linhas: LinhaLiquidacao[]) {
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
      })
      .from(sql`json_each(${`[${p.join(",")}]`})`)
      .where(sql`1`);
    return db.insert(liquidacoesStaging).select(sel as never).onConflictDoNothing();
  });
}

/** O destino como valores SQL (o órgão e a unidade do cadastro do órgão do lote). */
const orgaoSql = (d: OrgaoDoCard) => sql`${d.orgaoId}`;
const unidadeSql = (d: OrgaoDoCard) => (d.reparticaoId == null ? sql`NULL` : sql`${d.reparticaoId}`);

const chavesDoLote = (db: Db, loteId: number) => db.select({ c: liquidacoesStaging.chave }).from(liquidacoesStaging).where(eq(liquidacoesStaging.loteId, loteId));

/** As liquidações do card, do ano e do órgão da Centi que a Centi não trouxe mais. */
const sumiram = (db: Db, loteId: number, card: number, ano: number, idOrgao: number) =>
  and(
    eq(liquidacoes.cardId, card),
    eq(liquidacoes.ano, ano),
    eq(liquidacoes.idOrgaoCenti, idOrgao),
    isNull(liquidacoes.removidoEm),
    notInArray(liquidacoes.chave, chavesDoLote(db, loteId)),
    notInArray(liquidacoes.chave, chavesIguais(db, loteId)),
  );

const COMPARADOS = CAMPOS.filter((c) => c !== "chave");
const colLiq = (c: string) => sql.raw(`"liquidacoes"."${colunaSql(c)}"`);
const colStg = (c: string) => sql.raw(`"liquidacoes_staging"."${colunaSql(c)}"`);

/** "Mudou": algum campo diferente, o DESTINO mudou (o órgão do card ganhou outra unidade), estava removida ou outro leitor. */
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

/** O resumo da promoção: novas, atualizadas de fato e removidas (não vieram mais). Toda liquidação do órgão tem destino
 * (o órgão do card) — não há "fora". */
export async function contagemLiquidacoes(db: Db, loteId: number, card: number, destino: OrgaoDoCard, ano: number, idOrgao: number, leitor: number) {
  const [novos] = await db
    .select({ n: count() })
    .from(liquidacoesStaging)
    .where(
      and(
        eq(liquidacoesStaging.loteId, loteId),
        sql`NOT EXISTS (SELECT 1 FROM ${liquidacoes} WHERE ${liquidacoes.cardId} = ${card} AND ${liquidacoes.chave} = ${liquidacoesStaging.chave})`,
      ),
    );
  const [alterados] = await db
    .select({ n: count() })
    .from(liquidacoesStaging)
    .innerJoin(liquidacoes, and(eq(liquidacoes.cardId, card), eq(liquidacoes.chave, liquidacoesStaging.chave)))
    .where(and(eq(liquidacoesStaging.loteId, loteId), mudou(colLiq, colStg, sql`${leitor}`, orgaoSql(destino), unidadeSql(destino))));
  const [removidos] = await db.select({ n: count() }).from(liquidacoes).where(sumiram(db, loteId, card, ano, idOrgao));
  return { inseridos: novos.n, atualizados: alterados.n, removidos: removidos.n, fora: 0 };
}

/**
 * A CONFERÊNCIA EM TEMPO REAL de uma página de LIQUIDAÇÕES (a mesma das de empenhos — `comandosConferirPagina`): compara
 * cada liquidação guardada da página com a GRAVADA no card pela régua da promoção (`mudou`, com o destino e o leitor),
 * grava o RESULTADO no passo e tira do staging as IGUAIS (fica só a chave).
 */
export function comandosConferirLiquidacoes(db: Db, loteId: number, card: number, destino: OrgaoDoCard, leitor: number, chaves: readonly string[]) {
  const lista = sql`(SELECT value FROM json_each(${JSON.stringify(chaves)}))`;
  const daPagina = sql`"liquidacoes_staging"."lote_id" = ${loteId} AND "liquidacoes_staging"."chave" IN ${lista}`;
  const juntos = sql`"liquidacoes_staging" JOIN "liquidacoes" ON "liquidacoes"."card_id" = ${card} AND "liquidacoes"."chave" = "liquidacoes_staging"."chave"`;
  const difere = mudou(colLiq, colStg, sql`${leitor}`, orgaoSql(destino), unidadeSql(destino));
  return [
    db
      .update(centiLotePassos)
      .set({
        resNovos: sql`(SELECT COUNT(*) FROM "liquidacoes_staging" WHERE ${daPagina} AND NOT EXISTS (SELECT 1 FROM "liquidacoes" WHERE "liquidacoes"."card_id" = ${card} AND "liquidacoes"."chave" = "liquidacoes_staging"."chave"))`,
        resAlterados: sql`(SELECT COUNT(*) FROM ${juntos} WHERE ${daPagina} AND (${difere}))`,
        resIguais: sql`(SELECT COUNT(*) FROM ${juntos} WHERE ${daPagina} AND NOT (${difere}))`,
        resSemVinculo: 0,
      })
      .where(eq(centiLotePassos.id, ultimoPasso(loteId))),
    db.delete(centiStagingFora).where(and(eq(centiStagingFora.loteId, loteId), eq(centiStagingFora.igual, 1), sql`${centiStagingFora.chave} IN ${lista}`)),
    db
      .insert(centiStagingFora)
      .select(
        db
          .select({ loteId: sql<number>`${loteId}`.as("lote_id"), chave: sql<string>`"liquidacoes_staging"."chave"`.as("chave"), igual: sql<number>`1`.as("igual") })
          .from(juntos)
          .where(sql`${daPagina} AND NOT (${difere})`) as never,
      )
      .onConflictDoNothing(),
    db.delete(liquidacoesStaging).where(
      and(
        eq(liquidacoesStaging.loteId, loteId),
        sql`${liquidacoesStaging.chave} IN ${lista}`,
        sql`EXISTS (SELECT 1 FROM "centi_staging_fora" f WHERE f."lote_id" = ${loteId} AND f."chave" = "liquidacoes_staging"."chave" AND f."igual" = 1)`,
      ),
    ),
  ] as const;
}

const VALORES = ["valor", "valorAnulado", "valorLiquido", "valorPago", "saldo"] as const;

/** Quantas liquidações do lote têm valor SUSPEITO (negativo ou acima do limite) — a conclusão não promove. */
export async function liquidacoesSuspeitas(db: Db, loteId: number): Promise<number> {
  const fora = (c: (typeof liquidacoesStaging)[(typeof VALORES)[number]]) => sql`(${c} < 0 OR ${c} > ${LIMITE_VALOR_LIQUIDACAO})`;
  const [r] = await db
    .select({ n: count() })
    .from(liquidacoesStaging)
    .where(and(eq(liquidacoesStaging.loteId, loteId), or(...VALORES.map((v) => fora(liquidacoesStaging[v])))));
  return r?.n ?? 0;
}

/** A última importação de liquidações CONCLUÍDA do mesmo card, ano e órgão da Centi (a base da conferência de queda). */
export async function ultimaLiquidacaoPromovida(db: Db, card: number, ano: number, idOrgao: number, exceto: number) {
  const [l] = await db
    .select({ soma: centiLotes.soma, unicos: centiLotes.unicos })
    .from(centiLotes)
    .where(
      and(
        eq(centiLotes.cardId, card),
        eq(centiLotes.ano, ano),
        eq(centiLotes.modo, "liquidacoes"),
        eq(centiLotes.idOrgaoCenti, idOrgao),
        eq(centiLotes.estado, "promovido"),
        ne(centiLotes.id, exceto),
      ),
    )
    .orderBy(desc(centiLotes.id))
    .limit(1);
  return l ?? null;
}

/**
 * PROMOVE o lote de liquidações conferido, num lote ATÔMICO: grava/atualiza as liquidações do órgão com o DESTINO dele no
 * card (o órgão e a unidade do cadastro), trata as que a Centi não trouxe mais (do mesmo ano e órgão) pela REGRA do card,
 * fecha o lote e limpa o staging.
 */
export function comandosPromoverLiquidacoes(
  db: Db,
  loteId: number,
  card: number,
  destino: OrgaoDoCard,
  ano: number,
  idOrgao: number,
  leitor: number,
  regra: RegraRemovidos,
  contagem: { inseridos: number; atualizados: number; removidos: number; fora: number },
) {
  const sel = db
    .select({
      id: sql<number>`NULL`.as("id"),
      ...Object.fromEntries(CAMPOS.map((c) => [c, liquidacoesStaging[c]])),
      idOrgaoCenti: sql<number>`${idOrgao}`.as("id_orgao_centi"),
      orgaoId: sql<number>`${orgaoSql(destino)}`.as("orgao_id"),
      reparticaoId: sql<number | null>`${unidadeSql(destino)}`.as("reparticao_id"),
      cardId: sql<number>`${card}`.as("card_id"),
      loteId: liquidacoesStaging.loteId,
      removidoEm: sql<string | null>`NULL`.as("removido_em"),
      leitor: sql<number>`${leitor}`.as("leitor"),
      criadoEm: sql<string>`CURRENT_TIMESTAMP`.as("criado_em"),
      atualizadoEm: sql<string>`CURRENT_TIMESTAMP`.as("atualizado_em"),
    })
    .from(liquidacoesStaging)
    .where(eq(liquidacoesStaging.loteId, loteId));
  const atualizar = Object.fromEntries([...COMPARADOS, "idOrgaoCenti", "orgaoId", "reparticaoId", "loteId", "removidoEm", "leitor"].map((c) => [c, sql.raw(`excluded.${colunaSql(c)}`)]));
  return [
    db
      .insert(liquidacoes)
      .select(sel as never)
      .onConflictDoUpdate({
        target: [liquidacoes.cardId, liquidacoes.chave],
        set: { ...atualizar, atualizadoEm: sql`CURRENT_TIMESTAMP` },
        setWhere: mudou(colLiq, (c) => sql.raw(`excluded."${colunaSql(c)}"`), sql`excluded."leitor"`, sql`excluded."orgao_id"`, sql`excluded."reparticao_id"`),
      }),
    regra === "apagar"
      ? db.delete(liquidacoes).where(sumiram(db, loteId, card, ano, idOrgao))
      : db.update(liquidacoes).set({ removidoEm: sql`CURRENT_TIMESTAMP`, atualizadoEm: sql`CURRENT_TIMESTAMP` }).where(sumiram(db, loteId, card, ano, idOrgao)),
    db
      .update(centiLotes)
      .set({ estado: "promovido", ...contagem, mensagem: null, condutor: null, conduzindoAte: null, concluidoEm: sql`CURRENT_TIMESTAMP`, vistoEm: sql`CURRENT_TIMESTAMP` })
      .where(eq(centiLotes.id, loteId)),
    db.delete(liquidacoesStaging).where(eq(liquidacoesStaging.loteId, loteId)),
    db.delete(centiStagingFora).where(eq(centiStagingFora.loteId, loteId)),
  ] as const;
}
