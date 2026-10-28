import { and, count, desc, eq, isNotNull, isNull, ne, notInArray, or, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { centiLeituras, centiLotes, pagamentos, pagamentosStaging } from "../db/schema.ts";
import { comandoAlteracoesDoLote, comandoAlteracoesSumiram } from "./centi-alteracoes-sql.ts";
import type { RegraRemovidos } from "./empenho-cards-core.ts";
import { type ComHash, type ConfTabela, type ContagemPromocao, chavesDaLista, comandosAusencia, comandosConferirAssinatura, comandosGuardarStaging, loteLendo } from "./empenhos-sql.ts";
import type { ParIgual } from "./importacao-partes-core.ts";
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

/** A conferência pela assinatura deste tipo (o órgão da Centi da página vai em toda linha; sem DESTINO não é guardado). */
const conf = (idOrgao: number): ConfTabela => ({ tabela: "pagamentos", campos: CAMPOS, extras: { idOrgaoCenti: idOrgao }, destino: sql`${DESTINO.orgao} IS NOT NULL`, soma: `CASE WHEN e."anulado" = 1 THEN 0 ELSE e."valor_liquido" END` });

/** Guarda a página (de UM órgão da Centi) no STAGING, sem conferir (a base dos testes). */
export function comandosGuardarPagamentos(db: Db, loteId: number, pagina: number, idOrgao: number, linhas: readonly ComHash<LinhaPagamento>[]) {
  return comandosGuardarStaging(db, { ...conf(idOrgao), destino: undefined }, loteId, pagina, linhas);
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
export function comandoRealinharPagamentos(db: Db, so?: { card: number; ano: number }) {
  const num = sql.raw(`"pagamentos"."numero_empenho"`);
  return db
    .update(pagamentos)
    .set({ orgaoId: sql`${doEmpenho(num, "orgao_id")}`, reparticaoId: sql`${doEmpenho(num, "reparticao_id")}`, atualizadoEm: sql`CURRENT_TIMESTAMP` })
    .where(
      and(
        // Depois de PROMOVER: só os números do card e do ano promovidos (pelo índice do número) — nunca a tabela inteira.
        so ? sql`${pagamentos.numeroEmpenho} IN (SELECT e.numero FROM empenhos e WHERE e.card_id = ${so.card} AND e.ano = ${so.ano})` : undefined,
        temEmpenho(num),
        sql`(${pagamentos.orgaoId} IS NOT ${doEmpenho(num, "orgao_id")} OR ${pagamentos.reparticaoId} IS NOT ${doEmpenho(num, "reparticao_id")})`,
      ),
    );
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
    notInArray(pagamentos.chave, chavesDaLista(loteId, "iguais")),
    // O SEM DESTINO foi lido (só não é gravado): não "sumiu".
    notInArray(pagamentos.chave, chavesDaLista(loteId, "fora")),
  );

const COMPARADOS = [...CAMPOS.filter((c) => c !== "chave"), "idOrgaoCenti"];
const colPag = (c: string) => sql.raw(`"pagamentos"."${colunaSql(c)}"`);
const colStg = (c: string) => sql.raw(`"pagamentos_staging"."${colunaSql(c)}"`);

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
  // FORA = os sem destino da leitura (as chaves) + os guardados que perderam o destino antes da conclusão.
  const [perdeu] = await db
    .select({ n: count() })
    .from(pagamentosStaging)
    .where(and(eq(pagamentosStaging.loteId, loteId), sql`${DESTINO.orgao} IS NULL`));
  const [semDestino] = await db.select({ n: sql<number>`COUNT(DISTINCT "value")` }).from(sql`${chavesDaLista(loteId, "fora")}`).where(sql`"value" NOT IN ${chavesDoLote(db, loteId)}`);
  const [removidos] = await db.select({ n: count() }).from(pagamentos).where(and(loteLendo(loteId), sumiram(db, loteId, card, ano, orgaos), isNotNull(pagamentos.ausenteDesdeLote)));
  const [ausentes] = await db.select({ n: count() }).from(pagamentos).where(and(loteLendo(loteId), sumiram(db, loteId, card, ano, orgaos), isNull(pagamentos.ausenteDesdeLote)));
  return { inseridos: novos.n, atualizados: alterados.n, removidos: removidos.n, ausentes: ausentes.n, fora: perdeu.n + Number(semDestino?.n ?? 0) };
}

/**
 * GUARDA e CONFERE EM TEMPO REAL uma página de PAGAMENTOS (de UM órgão da Centi), num lote só — a MESMA régua das de empenhos
 * (`comandosConferirPagina`): cada registro LIDO é comparado com o gravado no card ANTES de guardar (pela promoção — `mudou`,
 * com o destino pelo empenho e o leitor); o resultado e as LISTAS das chaves (iguais · sem destino) vão ao passo — o IGUAL e
 * o SEM DESTINO nunca são escritos no staging.
 */
export function comandosConferirPagamentos(db: Db, loteId: number, card: number, pagina: number, idOrgao: number, linhas: readonly ComHash<LinhaPagamento>[], iguais: readonly ParIgual[] = [], passo?: number) {
  return comandosConferirAssinatura(db, conf(idOrgao), loteId, card, pagina, linhas, iguais, [], passo);
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
  contagem: ContagemPromocao,
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
      ausenteDesdeLote: sql<number | null>`NULL`.as("ausente_desde_lote"),
      hash: pagamentosStaging.hash,
    })
    .from(pagamentosStaging)
    .where(and(eq(pagamentosStaging.loteId, loteId), sql`${DESTINO.orgao} IS NOT NULL`));
  const atualizar = Object.fromEntries([...COMPARADOS, "orgaoId", "reparticaoId", "loteId", "removidoEm", "leitor", "ausenteDesdeLote", "hash"].map((c) => [c, sql.raw(`excluded.${colunaSql(c)}`)]));
  const sumiu = sumiram(db, loteId, card, ano, orgaos);
  return [
    // O HISTÓRICO primeiro (o valor de ANTES ainda está gravado).
    comandoAlteracoesDoLote(db, "pagamento", { final: "pagamentos", staging: "pagamentos_staging", campos: COMPARADOS }, loteId, card, sql`${loteLendo(loteId)} AND ${DESTINO.orgao} IS NOT NULL`),
    comandoAlteracoesSumiram(db, "pagamento", "pagamentos", loteId, card, and(loteLendo(loteId), sumiu) as SQL),
    db
      .insert(pagamentos)
      .select(sel as never)
      .onConflictDoUpdate({
        target: [pagamentos.cardId, pagamentos.chave],
        set: { ...atualizar, atualizadoEm: sql`CURRENT_TIMESTAMP` },
        setWhere: sql`${mudou(colPag, (c) => sql.raw(`excluded."${colunaSql(c)}"`), sql`excluded."leitor"`, sql`excluded."orgao_id"`, sql`excluded."reparticao_id"`)} OR "pagamentos"."hash" IS NOT excluded."hash"`,
      }),
    ...comandosAusencia(db, pagamentos, loteId, regra, sumiu),
    db
      .update(centiLotes)
      .set({ estado: "promovido", ...contagem, mensagem: null, condutor: null, conduzindoAte: null, concluidoEm: sql`CURRENT_TIMESTAMP`, vistoEm: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(centiLotes.id, loteId), eq(centiLotes.estado, "lendo"))),
    db.delete(pagamentosStaging).where(eq(pagamentosStaging.loteId, loteId)),
    db.delete(centiLeituras).where(eq(centiLeituras.loteId, loteId)),
  ] as const;
}

