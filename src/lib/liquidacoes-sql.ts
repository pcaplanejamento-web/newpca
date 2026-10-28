import { and, count, desc, eq, isNotNull, isNull, ne, notInArray, or, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { centiLeituras, centiLotePassos, centiLotes, liquidacoes, liquidacoesStaging } from "../db/schema.ts";
import { comandoAlteracoesDoLote, comandoAlteracoesSumiram } from "./centi-alteracoes-sql.ts";
import type { RegraRemovidos } from "./empenho-cards-core.ts";
import { type ComHash, type ConfTabela, type ContagemPromocao, chavesDaLista, comandosAusencia, comandosConferirAssinatura, comandosGuardarStaging, loteLendo, ultimoPasso } from "./empenhos-sql.ts";
import type { ParIgual } from "./importacao-partes-core.ts";
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

/** A conferência pela assinatura deste tipo (o órgão da Centi da página vai em toda linha; sem DESTINO não é guardado). */
const conf = (idOrgao: number): ConfTabela => ({ tabela: "liquidacoes", campos: CAMPOS, extras: { idOrgaoCenti: idOrgao }, destino: sql`${DESTINO.orgao} IS NOT NULL`, soma: `e."valor"` });

/** Guarda a página (de UM órgão da Centi) no STAGING, sem conferir (a base dos testes). */
export function comandosGuardarLiquidacoes(db: Db, loteId: number, pagina: number, idOrgao: number, linhas: readonly ComHash<LinhaLiquidacao>[]) {
  return comandosGuardarStaging(db, { ...conf(idOrgao), destino: undefined }, loteId, pagina, linhas);
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
export function comandoRealinharLiquidacoes(db: Db, so?: { card: number; ano: number }) {
  const num = sql.raw(`"liquidacoes"."numero_empenho"`);
  return db
    .update(liquidacoes)
    .set({ orgaoId: sql`${doEmpenho(num, "orgao_id")}`, reparticaoId: sql`${doEmpenho(num, "reparticao_id")}`, atualizadoEm: sql`CURRENT_TIMESTAMP` })
    .where(
      and(
        // Depois de PROMOVER: só os números do card e do ano promovidos (pelo índice do número) — nunca a tabela inteira.
        so ? sql`${liquidacoes.numeroEmpenho} IN (SELECT e.numero FROM empenhos e WHERE e.card_id = ${so.card} AND e.ano = ${so.ano})` : undefined,
        temEmpenho(num),
        sql`(${liquidacoes.orgaoId} IS NOT ${doEmpenho(num, "orgao_id")} OR ${liquidacoes.reparticaoId} IS NOT ${doEmpenho(num, "reparticao_id")})`,
      ),
    );
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
    notInArray(liquidacoes.chave, chavesDaLista(loteId, "iguais")),
    // O SEM DESTINO foi lido (só não é gravado): não "sumiu".
    notInArray(liquidacoes.chave, chavesDaLista(loteId, "fora")),
  );

const COMPARADOS = [...CAMPOS.filter((c) => c !== "chave"), "idOrgaoCenti"];
const colLiq = (c: string) => sql.raw(`"liquidacoes"."${colunaSql(c)}"`);
const colStg = (c: string) => sql.raw(`"liquidacoes_staging"."${colunaSql(c)}"`);

/** "Mudou": algum campo diferente, o DESTINO mudou (o empenho ganhou outra unidade, ou chegou), estava removido/ausente
 * (volta) ou outro leitor. */
function mudou(atual: (c: string) => SQL, novo: (c: string) => SQL, leitorNovo: SQL, orgaoNovo: SQL, unidadeNovo: SQL): SQL {
  return sql.join(
    [
      ...COMPARADOS.map((c) => sql`${atual(c)} IS NOT ${novo(c)}`),
      sql`${atual("orgaoId")} IS NOT ${orgaoNovo}`,
      sql`${atual("reparticaoId")} IS NOT ${unidadeNovo}`,
      sql`${atual("removidoEm")} IS NOT NULL`,
      sql`${atual("ausenteDesdeLote")} IS NOT NULL`,
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
  // FORA = os sem destino da leitura (as chaves) + os guardados que perderam o destino antes da conclusão.
  const [perdeu] = await db
    .select({ n: count() })
    .from(liquidacoesStaging)
    .where(and(eq(liquidacoesStaging.loteId, loteId), sql`${DESTINO.orgao} IS NULL`));
  const [semDestino] = await db.select({ n: sql<number>`COUNT(DISTINCT "value")` }).from(sql`${chavesDaLista(loteId, "fora")}`).where(sql`"value" NOT IN ${chavesDoLote(db, loteId)}`);
  const [removidos] = await db.select({ n: count() }).from(liquidacoes).where(and(loteLendo(loteId), sumiram(db, loteId, card, ano, orgaos), isNotNull(liquidacoes.ausenteDesdeLote)));
  const [ausentes] = await db.select({ n: count() }).from(liquidacoes).where(and(loteLendo(loteId), sumiram(db, loteId, card, ano, orgaos), isNull(liquidacoes.ausenteDesdeLote)));
  return { inseridos: novos.n, atualizados: alterados.n, removidos: removidos.n, ausentes: ausentes.n, fora: perdeu.n + Number(semDestino?.n ?? 0) };
}

/**
 * GUARDA e CONFERE EM TEMPO REAL uma página de LIQUIDAÇÕES (de UM órgão da Centi), num lote só — a MESMA régua das de empenhos
 * (`comandosConferirPagina`): cada registro LIDO é comparado com o gravado no card ANTES de guardar (pela promoção — `mudou`,
 * com o destino pelo empenho e o leitor); o resultado e as LISTAS das chaves (iguais · sem destino) vão ao passo — o IGUAL e
 * o SEM DESTINO nunca são escritos no staging.
 */
export function comandosConferirLiquidacoes(db: Db, loteId: number, card: number, pagina: number, idOrgao: number, linhas: readonly ComHash<LinhaLiquidacao>[], iguais: readonly ParIgual[] = [], passo?: number, leitor?: number) {
  return comandosConferirAssinatura(db, { ...conf(idOrgao), leitor }, loteId, card, pagina, linhas, iguais, [], passo);
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
  contagem: ContagemPromocao,
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
      ausenteDesdeLote: sql<number | null>`NULL`.as("ausente_desde_lote"),
      hash: liquidacoesStaging.hash,
    })
    .from(liquidacoesStaging)
    .where(and(eq(liquidacoesStaging.loteId, loteId), sql`${DESTINO.orgao} IS NOT NULL`));
  const atualizar = Object.fromEntries([...COMPARADOS, "orgaoId", "reparticaoId", "loteId", "removidoEm", "leitor", "ausenteDesdeLote", "hash"].map((c) => [c, sql.raw(`excluded.${colunaSql(c)}`)]));
  const sumiu = sumiram(db, loteId, card, ano, orgaos);
  return [
    // O HISTÓRICO primeiro (o valor de ANTES ainda está gravado).
    comandoAlteracoesDoLote(db, "liquidacao", { final: "liquidacoes", staging: "liquidacoes_staging", campos: COMPARADOS }, loteId, card, sql`${loteLendo(loteId)} AND ${DESTINO.orgao} IS NOT NULL`),
    comandoAlteracoesSumiram(db, "liquidacao", "liquidacoes", loteId, card, and(loteLendo(loteId), sumiu) as SQL),
    db
      .insert(liquidacoes)
      .select(sel as never)
      .onConflictDoUpdate({
        target: [liquidacoes.cardId, liquidacoes.chave],
        set: { ...atualizar, atualizadoEm: sql`CURRENT_TIMESTAMP` },
        setWhere: sql`${mudou(colLiq, (c) => sql.raw(`excluded."${colunaSql(c)}"`), sql`excluded."leitor"`, sql`excluded."orgao_id"`, sql`excluded."reparticao_id"`)} OR "liquidacoes"."hash" IS NOT excluded."hash"`,
      }),
    ...comandosAusencia(db, liquidacoes, loteId, regra, sumiu),
    db
      .update(centiLotes)
      .set({ estado: "promovido", ...contagem, mensagem: null, condutor: null, conduzindoAte: null, concluidoEm: sql`CURRENT_TIMESTAMP`, vistoEm: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(centiLotes.id, loteId), eq(centiLotes.estado, "lendo"))),
    db.delete(liquidacoesStaging).where(eq(liquidacoesStaging.loteId, loteId)),
    db.delete(centiLeituras).where(eq(centiLeituras.loteId, loteId)),
  ] as const;
}

/**
 * Os ÓRGÃOS são lidos em PARALELO (cada um numa requisição): o FECHO do período é decidido NO BANCO, dentro do lote da
 * página (os lotes do D1 são transações em série — nunca dois ao mesmo tempo): (1) o período que outro órgão já DIVIDIU
 * (resposta grande demais) não aceita a leitura que chegou depois — ela vira "dividido" também (o período recomeça nas
 * metades, com todos os órgãos); (2) o período termina quando TODOS os órgãos (páginas 1..n) têm uma leitura válida — o
 * último a chegar, em qualquer ordem, marca o fim no próprio passo.
 */
export function comandosFechoPeriodoLiquidacoes(db: Db, loteId: number, periodo: { inicio: string; fim: string }, paginas: number, passo?: number) {
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
          eq(centiLotePassos.id, passo ?? ultimoPasso(loteId)),
          eq(centiLotePassos.estado, "ok"),
          sql`(SELECT COUNT(DISTINCT o."pagina") FROM ${centiLotePassos} AS o WHERE o."lote_id" = ${loteId} AND o."inicio" = ${periodo.inicio} AND o."fim" = ${periodo.fim} AND o."estado" = 'ok' AND o."pagina" BETWEEN 1 AND ${paginas}) >= ${paginas}`,
        ),
      ),
  ] as const;
}
