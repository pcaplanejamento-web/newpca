import { and, count, desc, eq, isNotNull, isNull, ne, notInArray, or, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { centiLotePassos, centiLotes, centiStagingFora, liquidacoes, liquidacoesStaging } from "../db/schema.ts";
import type { RegraRemovidos } from "./empenho-cards-core.ts";
import { chavesIguais, MAX_JSON_GUARDA, ultimoPasso } from "./empenhos-sql.ts";
import { LIMITE_VALOR_LIQUIDACAO, type LinhaLiquidacao } from "./liquidacoes-core.ts";

/**
 * LIQUIDAÇÕES — os comandos da importação como BUILDERS do Drizzle (testados pelo driver D1 REAL — `tests/liquidacoes.test.ts`),
 * no MESMO padrão dos empenhos (`empenhos-sql.ts`): a página num ÚNICO parâmetro JSON, a promoção num lote atômico. O
 * lote lê TODOS os órgãos da Centi; o DESTINO de cada liquidação (o órgão e a unidade do cadastro) é o do EMPENHO de mesmo
 * NÚMERO (`destinoSql`) — sem ele, o órgão do cadastro com o "ID na Centi" da liquidação, sem unidade.
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

/** Guarda as liquidações da página (de UM órgão da Centi) no STAGING, em pedaços de JSON. */
export function comandosGuardarLiquidacoes(db: Db, loteId: number, pagina: number, idOrgao: number, linhas: LinhaLiquidacao[]) {
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
    return db.insert(liquidacoesStaging).select(sel as never).onConflictDoNothing();
  });
}

/**
 * O DESTINO de uma liquidação, em SQL, a partir das colunas dela (`numero_empenho`, `id_orgao_centi`): o EMPENHO de mesmo
 * NÚMERO dá o órgão e a unidade do cadastro (o número do empenho liga empenhos, liquidações e pagamentos — entre cards,
 * vale o ativo, com unidade, o mais antigo); sem ele, o órgão do cadastro com aquele "ID na Centi", sem unidade.
 */
const doEmpenho = (num: SQL, col: "orgao_id" | "reparticao_id") =>
  sql`(SELECT e.${sql.raw(`"${col}"`)} FROM "empenhos" e WHERE e."numero" = ${num} AND e."orgao_id" IS NOT NULL ORDER BY e."removido_em" IS NOT NULL, e."reparticao_id" IS NULL, e."id" LIMIT 1)`;
const temEmpenho = (num: SQL) => sql`EXISTS (SELECT 1 FROM "empenhos" e WHERE e."numero" = ${num} AND e."orgao_id" IS NOT NULL)`;
export function destinoSql(tabela: string) {
  const num = sql.raw(`"${tabela}"."numero_empenho"`);
  const orgaoCenti = sql.raw(`"${tabela}"."id_orgao_centi"`);
  return {
    orgao: sql`COALESCE(${doEmpenho(num, "orgao_id")}, (SELECT MIN(o."id") FROM "orgaos" o WHERE CAST(TRIM(o."entidade_centi") AS INTEGER) = ${orgaoCenti}))`,
    unidade: doEmpenho(num, "reparticao_id"),
  };
}
const DESTINO = destinoSql("liquidacoes_staging");

/**
 * REALINHA as liquidações gravadas ao EMPENHO de mesmo número (o órgão e a unidade dele) — depois de promover empenhos ou
 * de mudar os vínculos de um card de empenhos (o empenho ganhou outra unidade, ou chegou depois da liquidação). Só as que
 * têm o empenho e mudaram; as sem empenho ficam como estão.
 */
export function comandoRealinharLiquidacoes(db: Db) {
  const num = sql.raw(`"liquidacoes"."numero_empenho"`);
  return db
    .update(liquidacoes)
    .set({ orgaoId: sql`${doEmpenho(num, "orgao_id")}`, reparticaoId: sql`${doEmpenho(num, "reparticao_id")}`, atualizadoEm: sql`CURRENT_TIMESTAMP` })
    .where(and(temEmpenho(num), sql`(${liquidacoes.orgaoId} IS NOT ${doEmpenho(num, "orgao_id")} OR ${liquidacoes.reparticaoId} IS NOT ${doEmpenho(num, "reparticao_id")})`));
}

const chavesDoLote = (db: Db, loteId: number) => db.select({ c: liquidacoesStaging.chave }).from(liquidacoesStaging).where(eq(liquidacoesStaging.loteId, loteId));

/** As liquidações do card, do ano e dos órgãos da Centi do lote que a Centi não trouxe mais. */
const sumiram = (db: Db, loteId: number, card: number, ano: number, orgaos: readonly number[]) =>
  and(
    eq(liquidacoes.cardId, card),
    eq(liquidacoes.ano, ano),
    sql`${liquidacoes.idOrgaoCenti} IN (SELECT value FROM json_each(${JSON.stringify(orgaos)}))`,
    isNull(liquidacoes.removidoEm),
    notInArray(liquidacoes.chave, chavesDoLote(db, loteId)),
    notInArray(liquidacoes.chave, chavesIguais(db, loteId)),
  );

const COMPARADOS = [...CAMPOS.filter((c) => c !== "chave"), "idOrgaoCenti"];
const colLiq = (c: string) => sql.raw(`"liquidacoes"."${colunaSql(c)}"`);
const colStg = (c: string) => sql.raw(`"liquidacoes_staging"."${colunaSql(c)}"`);

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
export async function contagemLiquidacoes(db: Db, loteId: number, card: number, ano: number, orgaos: readonly number[], leitor: number) {
  const doLote = and(eq(liquidacoesStaging.loteId, loteId), sql`${DESTINO.orgao} IS NOT NULL`);
  const [novos] = await db
    .select({ n: count() })
    .from(liquidacoesStaging)
    .where(and(doLote, sql`NOT EXISTS (SELECT 1 FROM ${liquidacoes} WHERE ${liquidacoes.cardId} = ${card} AND ${liquidacoes.chave} = ${liquidacoesStaging.chave})`));
  const [alterados] = await db
    .select({ n: count() })
    .from(liquidacoesStaging)
    .innerJoin(liquidacoes, and(eq(liquidacoes.cardId, card), eq(liquidacoes.chave, liquidacoesStaging.chave)))
    .where(and(doLote, mudou(colLiq, colStg, sql`${leitor}`, DESTINO.orgao, DESTINO.unidade)));
  const [fora] = await db
    .select({ n: count() })
    .from(liquidacoesStaging)
    .where(and(eq(liquidacoesStaging.loteId, loteId), sql`${DESTINO.orgao} IS NULL`));
  const [removidos] = await db.select({ n: count() }).from(liquidacoes).where(sumiram(db, loteId, card, ano, orgaos));
  return { inseridos: novos.n, atualizados: alterados.n, removidos: removidos.n, fora: fora.n };
}

/**
 * A CONFERÊNCIA EM TEMPO REAL de uma página de LIQUIDAÇÕES (a mesma das de empenhos — `comandosConferirPagina`): compara
 * cada liquidação guardada da página com a GRAVADA no card pela régua da promoção (`mudou`, com o destino pelo empenho e
 * o leitor), grava o RESULTADO no passo e tira do staging as IGUAIS (fica só a chave). Sem destino = "sem vínculo".
 */
export function comandosConferirLiquidacoes(db: Db, loteId: number, card: number, leitor: number, chaves: readonly string[]) {
  const lista = sql`(SELECT value FROM json_each(${JSON.stringify(chaves)}))`;
  const daPagina = sql`"liquidacoes_staging"."lote_id" = ${loteId} AND "liquidacoes_staging"."chave" IN ${lista}`;
  const juntos = sql`"liquidacoes_staging" JOIN "liquidacoes" ON "liquidacoes"."card_id" = ${card} AND "liquidacoes"."chave" = "liquidacoes_staging"."chave"`;
  const difere = mudou(colLiq, colStg, sql`${leitor}`, DESTINO.orgao, DESTINO.unidade);
  const comDestino = sql`${DESTINO.orgao} IS NOT NULL`;
  return [
    db
      .update(centiLotePassos)
      .set({
        resNovos: sql`(SELECT COUNT(*) FROM "liquidacoes_staging" WHERE ${daPagina} AND ${comDestino} AND NOT EXISTS (SELECT 1 FROM "liquidacoes" WHERE "liquidacoes"."card_id" = ${card} AND "liquidacoes"."chave" = "liquidacoes_staging"."chave"))`,
        resAlterados: sql`(SELECT COUNT(*) FROM ${juntos} WHERE ${daPagina} AND ${comDestino} AND (${difere}))`,
        resIguais: sql`(SELECT COUNT(*) FROM ${juntos} WHERE ${daPagina} AND ${comDestino} AND NOT (${difere}))`,
        resSemVinculo: sql`(SELECT COUNT(*) FROM "liquidacoes_staging" WHERE ${daPagina} AND NOT (${comDestino}))`,
      })
      .where(eq(centiLotePassos.id, ultimoPasso(loteId))),
    db.delete(centiStagingFora).where(and(eq(centiStagingFora.loteId, loteId), eq(centiStagingFora.igual, 1), sql`${centiStagingFora.chave} IN ${lista}`)),
    db
      .insert(centiStagingFora)
      .select(
        db
          .select({ loteId: sql<number>`${loteId}`.as("lote_id"), chave: sql<string>`"liquidacoes_staging"."chave"`.as("chave"), igual: sql<number>`1`.as("igual") })
          .from(juntos)
          .where(sql`${daPagina} AND ${comDestino} AND NOT (${difere})`) as never,
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

/** A última importação de liquidações CONCLUÍDA do mesmo card e ano, com todos os órgãos (a base da conferência de queda;
 * as antigas, de um órgão só, não servem de base). */
export async function ultimaLiquidacaoPromovida(db: Db, card: number, ano: number, exceto: number) {
  const [l] = await db
    .select({ soma: centiLotes.soma, unicos: centiLotes.unicos })
    .from(centiLotes)
    .where(
      and(
        eq(centiLotes.cardId, card),
        eq(centiLotes.ano, ano),
        eq(centiLotes.modo, "liquidacoes"),
        isNotNull(centiLotes.orgaosCenti),
        eq(centiLotes.estado, "promovido"),
        ne(centiLotes.id, exceto),
      ),
    )
    .orderBy(desc(centiLotes.id))
    .limit(1);
  return l ?? null;
}

/**
 * PROMOVE o lote de liquidações conferido, num lote ATÔMICO: grava/atualiza as liquidações com o DESTINO de cada uma (o
 * órgão e a unidade do EMPENHO de mesmo número — sem destino, não entram), trata as que a Centi não trouxe mais (do mesmo
 * ano e dos órgãos do lote) pela REGRA do card, fecha o lote e limpa o staging.
 */
export function comandosPromoverLiquidacoes(
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
      ...Object.fromEntries(CAMPOS.map((c) => [c, liquidacoesStaging[c]])),
      idOrgaoCenti: liquidacoesStaging.idOrgaoCenti,
      orgaoId: sql<number>`${DESTINO.orgao}`.as("orgao_id"),
      reparticaoId: sql<number | null>`${DESTINO.unidade}`.as("reparticao_id"),
      cardId: sql<number>`${card}`.as("card_id"),
      loteId: liquidacoesStaging.loteId,
      removidoEm: sql<string | null>`NULL`.as("removido_em"),
      leitor: sql<number>`${leitor}`.as("leitor"),
      criadoEm: sql<string>`CURRENT_TIMESTAMP`.as("criado_em"),
      atualizadoEm: sql<string>`CURRENT_TIMESTAMP`.as("atualizado_em"),
    })
    .from(liquidacoesStaging)
    .where(and(eq(liquidacoesStaging.loteId, loteId), sql`${DESTINO.orgao} IS NOT NULL`));
  const atualizar = Object.fromEntries([...COMPARADOS, "orgaoId", "reparticaoId", "loteId", "removidoEm", "leitor"].map((c) => [c, sql.raw(`excluded.${colunaSql(c)}`)]));
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
      ? db.delete(liquidacoes).where(sumiram(db, loteId, card, ano, orgaos))
      : db.update(liquidacoes).set({ removidoEm: sql`CURRENT_TIMESTAMP`, atualizadoEm: sql`CURRENT_TIMESTAMP` }).where(sumiram(db, loteId, card, ano, orgaos)),
    db
      .update(centiLotes)
      .set({ estado: "promovido", ...contagem, mensagem: null, condutor: null, conduzindoAte: null, concluidoEm: sql`CURRENT_TIMESTAMP`, vistoEm: sql`CURRENT_TIMESTAMP` })
      .where(eq(centiLotes.id, loteId)),
    db.delete(liquidacoesStaging).where(eq(liquidacoesStaging.loteId, loteId)),
    db.delete(centiStagingFora).where(eq(centiStagingFora.loteId, loteId)),
  ] as const;
}

/**
 * Os ÓRGÃOS são lidos em PARALELO (cada um numa requisição): o FECHO do período é decidido NO BANCO, dentro do lote da
 * página (os lotes do D1 são transações em série — nunca dois ao mesmo tempo): (1) o período que outro órgão já DIVIDIU
 * (resposta grande demais) não aceita a leitura que chegou depois — ela vira "dividido" também (o período recomeça nas
 * metades, com todos os órgãos); (2) o período termina quando TODOS os órgãos (páginas 1..n) têm uma leitura válida — o
 * último a chegar, em qualquer ordem, marca o fim no próprio passo.
 */
export function comandosFechoPeriodoLiquidacoes(db: Db, loteId: number, periodo: { inicio: string; fim: string }, paginas: number) {
  const doPeriodo = sql`${centiLotePassos.loteId} = ${loteId} AND ${centiLotePassos.inicio} = ${periodo.inicio} AND ${centiLotePassos.fim} = ${periodo.fim}`;
  return [
    db
      .update(centiLotePassos)
      .set({ estado: "dividido" })
      .where(and(sql`${doPeriodo}`, eq(centiLotePassos.estado, "ok"), sql`EXISTS (SELECT 1 FROM ${centiLotePassos} AS d WHERE d."lote_id" = ${loteId} AND d."inicio" = ${periodo.inicio} AND d."fim" = ${periodo.fim} AND d."estado" = 'dividido')`)),
    db
      .update(centiLotePassos)
      .set({ fimPeriodo: 1 })
      .where(
        and(
          eq(centiLotePassos.id, ultimoPasso(loteId)),
          eq(centiLotePassos.estado, "ok"),
          sql`(SELECT COUNT(DISTINCT o."pagina") FROM ${centiLotePassos} AS o WHERE o."lote_id" = ${loteId} AND o."inicio" = ${periodo.inicio} AND o."fim" = ${periodo.fim} AND o."estado" = 'ok' AND o."pagina" BETWEEN 1 AND ${paginas}) >= ${paginas}`,
        ),
      ),
  ] as const;
}
