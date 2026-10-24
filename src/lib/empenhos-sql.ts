import { and, count, desc, eq, isNull, ne, notInArray, or, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { centiLeituras, centiLotePassos, centiLotes, centiStagingFora, empenhos, empenhosStaging, liquidacoes, liquidacoesStaging, pagamentos, pagamentosStaging } from "../db/schema.ts";
import type { RegraRemovidos } from "./empenho-cards-core.ts";
import { vinculoSql } from "./empenho-cards-sql.ts";
import { LIMITE_VALOR_EMPENHO, type LinhaEmpenho, type PassoNovo, type Periodo, SEGUNDOS_CONDUCAO } from "./empenhos-core.ts";

/**
 * EMPENHOS — os comandos da importação como BUILDERS do Drizzle (testados pelo driver D1 REAL sobre `node:sqlite`,
 * dentro de `db.batch` — `tests/empenhos.test.ts`). A página inteira vai num ÚNICO parâmetro JSON (`json_each`): um
 * comando por página, nunca o teto de 100 parâmetros do D1.
 */
type Db = DrizzleD1Database<typeof schema>;

const CAMPOS = [
  "chave",
  "ano",
  "srcId",
  "numero",
  "data",
  "orgaoGestor",
  "unidadeOrcamentaria",
  "fornecedor",
  "cpfCnpj",
  "modalidade",
  "licitacao",
  "funcao",
  "subfuncao",
  "programa",
  "acao",
  "elemento",
  "subelemento",
  "fonte",
  "valorEmpenhado",
  "valorAnulado",
  "valorLiquidado",
  "valorPago",
  "saldoPagar",
  "historico",
] as const satisfies readonly (keyof LinhaEmpenho)[];

/** Teto de caracteres do JSON de UM comando de guarda — o D1 recusa texto acima de 2 MB (com folga para os acentos). */
export const MAX_JSON_GUARDA = 600_000;

/**
 * Os registros SEM VÍNCULO da página: só a CHAVE (nenhum dado), para a conferência contar cada um uma vez. Pedaços de
 * até `MAX_JSON_GUARDA` caracteres, cada um num parâmetro JSON.
 */
export function comandosGuardarFora(db: Db, loteId: number, chaves: string[]) {
  const pedacos: string[][] = [];
  let atual: string[] = [];
  let tamanho = 0;
  for (const c of chaves) {
    if (atual.length && tamanho + c.length + 3 > MAX_JSON_GUARDA) {
      pedacos.push(atual);
      atual = [];
      tamanho = 0;
    }
    atual.push(c);
    tamanho += c.length + 3;
  }
  if (atual.length) pedacos.push(atual);
  return pedacos.map((p) =>
    db
      .insert(centiStagingFora)
      .select(
        db
          .select({ loteId: sql<number>`${loteId}`.as("lote_id"), chave: sql<string>`value`.as("chave"), igual: sql<number>`0`.as("igual") })
          .from(sql`json_each(${JSON.stringify(p)})`)
          .where(sql`1`) as never,
      )
      .onConflictDoNothing(),
  );
}

/** Guarda a página no STAGING (SÓ os registros com vínculo — quem chama filtra): as linhas em pedaços de até `MAX_JSON_GUARDA` caracteres, cada um num parâmetro JSON. */
export function comandosGuardarPagina(db: Db, loteId: number, pagina: number, linhas: LinhaEmpenho[]) {
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
    const json = `[${p.join(",")}]`;
    // As chaves na MESMA ordem das colunas da tabela (exigência do insert…select).
    const sel = db
      .select({
        loteId: sql<number>`${loteId}`.as("lote_id"),
        pagina: sql<number>`${pagina}`.as("pagina"),
        ...Object.fromEntries(CAMPOS.map((c, i) => [c, sql`json_extract(value, ${`$[${i}]`})`.as(c)])),
      })
      .from(sql`json_each(${json})`)
      // O WHERE desfaz a ambiguidade do SQLite entre "SELECT … ON CONFLICT" e a junção (exigido no upsert com SELECT).
      .where(sql`1`);
    return db.insert(empenhosStaging).select(sel as never).onConflictDoNothing();
  });
}

/** Registra um PASSO do lote (um pedido à Centi, lido ou com erro) — o que a tela acompanha ao vivo. */
export function comandoRegistrarPasso(db: Db, loteId: number, p: PassoNovo) {
  return db.insert(centiLotePassos).values({ loteId, ...p, fimPeriodo: p.fimPeriodo ? 1 : 0 });
}

/** O período grande demais é DIVIDIDO: as páginas dele já lidas deixam de contar (a leitura recomeça nas metades). */
export function comandoDividirPeriodo(db: Db, loteId: number, periodo: Periodo) {
  return db
    .update(centiLotePassos)
    .set({ estado: "dividido" })
    .where(and(eq(centiLotePassos.loteId, loteId), eq(centiLotePassos.inicio, periodo.inicio), eq(centiLotePassos.fim, periodo.fim), eq(centiLotePassos.estado, "ok")));
}

/**
 * RECONTA o lote pelos passos lidos (os divididos não contam): páginas, recebidos, recusados, os únicos do staging e o
 * TOTAL informado = a soma do total de cada período (desconhecido enquanto algum período lido não tiver o total).
 */
export function comandoRecontarLote(db: Db, loteId: number) {
  const ok = sql`${centiLotePassos.loteId} = ${loteId} AND ${centiLotePassos.estado} = 'ok'`;
  return db
    .update(centiLotes)
    .set({
      paginas: sql`(SELECT COUNT(*) FROM ${centiLotePassos} WHERE ${ok})`,
      recebidos: sql`(SELECT COALESCE(SUM(${centiLotePassos.recebidos}), 0) FROM ${centiLotePassos} WHERE ${ok})`,
      recusados: sql`(SELECT COALESCE(SUM(${centiLotePassos.recusados}), 0) FROM ${centiLotePassos} WHERE ${ok})`,
      // Os ÚNICOS = os guardados (com vínculo) + os só contados (sem vínculo — a chave); a SOMA = a de TODOS os registros
      // lidos (a última leitura de cada página), a mesma régua das importações anteriores na conferência de queda.
      // (o lote de LIQUIDAÇÕES guarda no staging dele — um lote é de um tipo só, a soma dos dois é o do lote)
      unicos: sql`((SELECT COUNT(*) FROM ${empenhosStaging} WHERE ${empenhosStaging.loteId} = ${loteId}) + (SELECT COUNT(*) FROM ${liquidacoesStaging} WHERE ${liquidacoesStaging.loteId} = ${loteId}) + (SELECT COUNT(*) FROM ${pagamentosStaging} WHERE ${pagamentosStaging.loteId} = ${loteId}) + (SELECT COUNT(*) FROM ${centiStagingFora} WHERE ${centiStagingFora.loteId} = ${loteId}))`,
      // FORA = só os sem vínculo (as chaves dos IGUAIS ao gravado contam nos únicos, não aqui).
      fora: sql`(SELECT COUNT(*) FROM ${centiStagingFora} WHERE ${centiStagingFora.loteId} = ${loteId} AND ${centiStagingFora.igual} = 0)`,
      soma: sql`(SELECT SUM(${centiLotePassos.soma}) FROM ${centiLotePassos} WHERE ${centiLotePassos.id} IN (SELECT MAX(${centiLotePassos.id}) FROM ${centiLotePassos} WHERE ${ok} GROUP BY ${centiLotePassos.inicio}, ${centiLotePassos.fim}, ${centiLotePassos.pagina}))`,
      // LIQUIDAÇÕES e PAGAMENTOS: cada "página" é um órgão com o PRÓPRIO total (lidos em paralelo) — o do período é a soma deles (a
      // última leitura de cada órgão); empenhos: o maior total informado em cada período.
      totalInformado: sql`(CASE WHEN ${centiLotes.modo} IN ('liquidacoes', 'pagamentos')
        THEN (SELECT CASE WHEN COUNT(t) = COUNT(*) THEN SUM(t) END FROM (SELECT ${centiLotePassos.total} AS t FROM ${centiLotePassos} WHERE ${centiLotePassos.id} IN (SELECT MAX(${centiLotePassos.id}) FROM ${centiLotePassos} WHERE ${ok} GROUP BY ${centiLotePassos.inicio}, ${centiLotePassos.fim}, ${centiLotePassos.pagina})))
        ELSE (SELECT CASE WHEN COUNT(t) = COUNT(*) THEN SUM(t) END FROM (SELECT MAX(${centiLotePassos.total}) AS t FROM ${centiLotePassos} WHERE ${ok} GROUP BY ${centiLotePassos.inicio}, ${centiLotePassos.fim})) END)`,
      vistoEm: sql`CURRENT_TIMESTAMP`,
    })
    .where(and(eq(centiLotes.id, loteId), eq(centiLotes.estado, "lendo")));
}

/** O que o período já leu (as páginas lidas e os registros) — para decidir se continua. */
export async function lidoNoPeriodo(db: Db, loteId: number, periodo: Periodo) {
  const [r] = await db
    .select({ paginas: count(), recebidos: sql<number>`COALESCE(SUM(${centiLotePassos.recebidos}), 0)`, total: sql<number | null>`MAX(${centiLotePassos.total})` })
    .from(centiLotePassos)
    .where(and(eq(centiLotePassos.loteId, loteId), eq(centiLotePassos.inicio, periodo.inicio), eq(centiLotePassos.fim, periodo.fim), eq(centiLotePassos.estado, "ok")));
  return { paginas: r?.paginas ?? 0, recebidos: Number(r?.recebidos ?? 0), total: r?.total == null ? null : Number(r.total) };
}

/** Quantas destas chaves o lote JÁ viu — guardadas ou só contadas (os "novos" de uma página = as que faltavam). */
export async function jaNoLote(db: Db, loteId: number, chaves: string[]): Promise<number> {
  if (!chaves.length) return 0;
  const lista = sql`(SELECT value FROM json_each(${JSON.stringify(chaves)}))`;
  // UMA consulta (as quatro tabelas do lote): cada requisição da importação conta as consultas (plano gratuito: 50).
  const conta = (t: string) => sql.raw(`(SELECT COUNT(*) FROM "${t}" WHERE "lote_id" = `);
  const de = (t: string) => sql`${conta(t)}${loteId} AND "chave" IN ${lista})`;
  const [r] = await db.select({ n: sql<number>`${de("empenhos_staging")} + ${de("liquidacoes_staging")} + ${de("pagamentos_staging")} + ${de("centi_staging_fora")}` }).from(sql`(SELECT 1)`);
  return Number(r?.n ?? 0);
}

/** Os campos comparados para saber se um empenho MUDOU (todos menos a chave). */
const COMPARADOS = CAMPOS.filter((c) => c !== "chave");

/** "Mudou": algum campo diferente (`IS NOT` — nulo conta), o vínculo mudou, o empenho estava removido ou foi lido por outro leitor. */
function mudou(atual: (c: string) => SQL, novo: (c: string) => SQL, leitorNovo: SQL, orgaoNovo: SQL, reparticaoNovo: SQL): SQL {
  return sql.join(
    [
      ...COMPARADOS.map((c) => sql`${atual(c)} IS NOT ${novo(c)}`),
      sql`${atual("orgaoId")} IS NOT ${orgaoNovo}`,
      sql`${atual("reparticaoId")} IS NOT ${reparticaoNovo}`,
      sql`${atual("removidoEm")} IS NOT NULL`,
      sql`${atual("leitor")} IS NOT ${leitorNovo}`,
    ],
    sql` OR `,
  );
}
const colEmp = (c: string) => sql.raw(`"empenhos"."${colunaSql(c)}"`);
const colStg = (c: string) => sql.raw(`"empenhos_staging"."${colunaSql(c)}"`);

/**
 * O VÍNCULO do registro pelos vínculos do CARD (o mais específico — `vinculoSql`). A leitura já só guarda o vinculado; a
 * promoção confere de NOVO (os vínculos podem ter mudado no meio): o que perdeu o vínculo não entra.
 */
const stagingVinculado = (card: number) => sql`${vinculoSql("empenhos_staging", card).orgao} IS NOT NULL`;

/** As chaves do lote que SERÃO gravadas (as vinculadas). */
const chavesVinculadas = (db: Db, loteId: number, card: number) =>
  db.select({ c: empenhosStaging.chave }).from(empenhosStaging).where(and(eq(empenhosStaging.loteId, loteId), stagingVinculado(card)));

/** As chaves que vieram IGUAIS ao gravado (conferidas em tempo real — só a chave ficou no lote). */
export const chavesIguais = (db: Db, loteId: number) =>
  db.select({ c: centiStagingFora.chave }).from(centiStagingFora).where(and(eq(centiStagingFora.loteId, loteId), eq(centiStagingFora.igual, 1)));

/** Os empenhos do card e do ano que a Centi não trouxe mais (fora das chaves vinculadas e das iguais do lote). */
const sumiram = (db: Db, loteId: number, card: number, ano: number) =>
  and(
    eq(empenhos.cardId, card),
    eq(empenhos.ano, ano),
    isNull(empenhos.removidoEm),
    notInArray(empenhos.chave, chavesVinculadas(db, loteId, card)),
    notInArray(empenhos.chave, chavesIguais(db, loteId)),
  );

/** O passo mais recente do lote (o que a página acabou de registrar no mesmo lote). */
export const ultimoPasso = (loteId: number) => sql`(SELECT MAX("id") FROM "centi_lote_passos" WHERE "lote_id" = ${loteId})`;

/** Lê o passo mais recente do lote — o último comando do lote da página (já com o resultado da conferência). */
export function consultaUltimoPasso(db: Db, loteId: number, passo?: number) {
  return db.select().from(centiLotePassos).where(eq(centiLotePassos.id, passo ?? ultimoPasso(loteId)));
}

/**
 * A CONFERÊNCIA EM TEMPO REAL de uma página de EMPENHOS, no MESMO lote em que ela é guardada (depois de guardar): compara
 * cada registro da página (`chaves` — os vinculados) com o GRAVADO pela MESMA régua da promoção (`mudou`, com o vínculo e o
 * leitor), grava no passo o RESULTADO (novos · alterados · iguais · sem vínculo) e tira do staging os IGUAIS — deles fica
 * só a chave (`igual` = 1), para a conferência com a Centi e para o que sumiu. Nada igual ao gravado ocupa espaço.
 */
export function comandosConferirPagina(db: Db, loteId: number, card: number, leitor: number, chaves: readonly string[], semVinculo: number, passo?: number) {
  const lista = sql`(SELECT value FROM json_each(${JSON.stringify(chaves)}))`;
  const v = vinculoSql("empenhos_staging", card);
  const daPagina = sql`"empenhos_staging"."lote_id" = ${loteId} AND "empenhos_staging"."chave" IN ${lista}`;
  const comGravado = sql`FROM "empenhos_staging" JOIN "empenhos" ON "empenhos"."card_id" = ${card} AND "empenhos"."chave" = "empenhos_staging"."chave" WHERE ${daPagina}`;
  const difere = mudou(colEmp, colStg, sql`${leitor}`, v.orgao, v.reparticao);
  return [
    db
      .update(centiLotePassos)
      .set({
        resNovos: sql`COALESCE(${centiLotePassos.resNovos}, 0) + (SELECT COUNT(*) FROM "empenhos_staging" WHERE ${daPagina} AND NOT EXISTS (SELECT 1 FROM "empenhos" WHERE "empenhos"."card_id" = ${card} AND "empenhos"."chave" = "empenhos_staging"."chave"))`,
        resAlterados: sql`COALESCE(${centiLotePassos.resAlterados}, 0) + (SELECT COUNT(*) ${comGravado} AND (${difere}))`,
        resIguais: sql`COALESCE(${centiLotePassos.resIguais}, 0) + (SELECT COUNT(*) ${comGravado} AND NOT (${difere}))`,
        resSemVinculo: sql`COALESCE(${centiLotePassos.resSemVinculo}, 0) + ${semVinculo}`,
      })
      .where(eq(centiLotePassos.id, passo ?? ultimoPasso(loteId))),
    // A classificação é a desta leitura: a chave que antes veio igual e agora mudou volta a ser guardada inteira.
    db.delete(centiStagingFora).where(and(eq(centiStagingFora.loteId, loteId), eq(centiStagingFora.igual, 1), sql`${centiStagingFora.chave} IN ${lista}`)),
    db
      .insert(centiStagingFora)
      .select(
        db
          .select({ loteId: sql<number>`${loteId}`.as("lote_id"), chave: sql<string>`"empenhos_staging"."chave"`.as("chave"), igual: sql<number>`1`.as("igual") })
          .from(sql`"empenhos_staging" JOIN "empenhos" ON "empenhos"."card_id" = ${card} AND "empenhos"."chave" = "empenhos_staging"."chave"`)
          .where(sql`${daPagina} AND NOT (${difere})`) as never,
      )
      .onConflictDoNothing(),
    db.delete(empenhosStaging).where(
      and(
        eq(empenhosStaging.loteId, loteId),
        sql`${empenhosStaging.chave} IN ${lista}`,
        sql`EXISTS (SELECT 1 FROM "centi_staging_fora" f WHERE f."lote_id" = ${loteId} AND f."chave" = "empenhos_staging"."chave" AND f."igual" = 1)`,
      ),
    ),
  ] as const;
}

/**
 * Quantos empenhos o lote cria, ATUALIZA DE FATO (algum valor ou o vínculo mudou), marca como removidos — e quantos
 * registros ficam FORA (unidade da Centi sem vínculo: não são gravados) — o resumo do lote.
 */
export async function contagemDaPromocao(db: Db, loteId: number, card: number, ano: number, leitor: number) {
  const vStg = vinculoSql("empenhos_staging", card);
  const [novos] = await db
    .select({ n: count() })
    .from(empenhosStaging)
    .where(
      and(
        eq(empenhosStaging.loteId, loteId),
        stagingVinculado(card),
        sql`NOT EXISTS (SELECT 1 FROM ${empenhos} WHERE ${empenhos.cardId} = ${card} AND ${empenhos.chave} = ${empenhosStaging.chave})`,
      ),
    );
  const [alterados] = await db
    .select({ n: count() })
    .from(empenhosStaging)
    .innerJoin(empenhos, and(eq(empenhos.cardId, card), eq(empenhos.chave, empenhosStaging.chave)))
    .where(and(eq(empenhosStaging.loteId, loteId), stagingVinculado(card), mudou(colEmp, colStg, sql`${leitor}`, vStg.orgao, vStg.reparticao)));
  const [removidos] = await db.select({ n: count() }).from(empenhos).where(sumiram(db, loteId, card, ano));
  // FORA = os só contados na leitura + os guardados que perderam o vínculo antes da conclusão (não entram).
  const [perdeu] = await db
    .select({ n: count() })
    .from(empenhosStaging)
    .where(and(eq(empenhosStaging.loteId, loteId), sql`NOT (${stagingVinculado(card)})`));
  const [contados] = await db.select({ n: count() }).from(centiStagingFora).where(and(eq(centiStagingFora.loteId, loteId), eq(centiStagingFora.igual, 0)));
  return { inseridos: novos.n, atualizados: alterados.n, removidos: removidos.n, fora: perdeu.n + contados.n };
}

const VALORES = ["valorEmpenhado", "valorAnulado", "valorLiquidado", "valorPago", "saldoPagar"] as const;

/** Quantos empenhos do lote têm valor SUSPEITO (negativo ou acima do limite) — a conclusão não promove. */
export async function valoresSuspeitos(db: Db, loteId: number): Promise<number> {
  const fora = (c: SQL | (typeof empenhosStaging)[(typeof VALORES)[number]]) => sql`(${c} < 0 OR ${c} > ${LIMITE_VALOR_EMPENHO})`;
  const [r] = await db
    .select({ n: count() })
    .from(empenhosStaging)
    .where(
      and(
        eq(empenhosStaging.loteId, loteId),
        or(...VALORES.map((v) => fora(empenhosStaging[v]))),
      ),
    );
  return r?.n ?? 0;
}

/** A última importação CONCLUÍDA do mesmo card e ano (a base da conferência de queda), sem o próprio lote. */
export async function ultimoPromovido(db: Db, card: number, ano: number, exceto: number) {
  const [l] = await db
    .select({ soma: centiLotes.soma, unicos: centiLotes.unicos })
    .from(centiLotes)
    .where(and(eq(centiLotes.cardId, card), eq(centiLotes.ano, ano), eq(centiLotes.estado, "promovido"), ne(centiLotes.id, exceto)))
    .orderBy(desc(centiLotes.id))
    .limit(1);
  return l ?? null;
}

/**
 * TRAVA de quem conduz o lote (uma aba por vez): a aba com o token entra se o lote está livre, já é dela ou a trava
 * venceu (`SEGUNDOS_CONDUCAO` sem notícia); cada página renova. Devolve a linha quando conseguiu.
 */
export function comandoConduzir(db: Db, loteId: number, condutor: string) {
  return db
    .update(centiLotes)
    .set({ condutor, conduzindoAte: sql`datetime('now', ${`+${SEGUNDOS_CONDUCAO} seconds`})` })
    .where(
      and(
        eq(centiLotes.id, loteId),
        eq(centiLotes.estado, "lendo"),
        or(isNull(centiLotes.condutor), eq(centiLotes.condutor, condutor), isNull(centiLotes.conduzindoAte), sql`${centiLotes.conduzindoAte} < datetime('now')`),
      ),
    )
    .returning({ id: centiLotes.id });
}

/** SOLTA a trava de quem conduz (a leitura parou numa falha): o lote segue ABERTO — qualquer aba continua de onde parou. */
export function comandoSoltarLote(db: Db, loteId: number, condutor: string) {
  return db
    .update(centiLotes)
    .set({ condutor: null, conduzindoAte: null, vistoEm: sql`CURRENT_TIMESTAMP` })
    .where(and(eq(centiLotes.id, loteId), eq(centiLotes.estado, "lendo"), eq(centiLotes.condutor, condutor)));
}

/**
 * PROMOVE o lote conferido, num lote ATÔMICO: grava/atualiza os empenhos VINCULADOS do card (com o órgão/unidade do
 * cadastro; o que reaparece perde o `removido_em`), trata o que o card tinha no ano e a Centi não trouxe mais pela REGRA
 * do card (marca `removido_em` ou apaga), APAGA o que ficou sem vínculo (banco limpo), fecha o lote e limpa o staging.
 */
export function comandosPromover(
  db: Db,
  loteId: number,
  card: number,
  ano: number,
  leitor: number,
  regra: RegraRemovidos,
  contagem: { inseridos: number; atualizados: number; removidos: number; fora: number },
) {
  const vStg = vinculoSql("empenhos_staging", card);
  const vEmp = vinculoSql("empenhos", card);
  const sel = db
    .select({
      id: sql<number>`NULL`.as("id"),
      ...Object.fromEntries(CAMPOS.map((c) => [c, empenhosStaging[c]])),
      loteId: empenhosStaging.loteId,
      removidoEm: sql<string | null>`NULL`.as("removido_em"),
      criadoEm: sql<string>`CURRENT_TIMESTAMP`.as("criado_em"),
      atualizadoEm: sql<string>`CURRENT_TIMESTAMP`.as("atualizado_em"),
      leitor: sql<number>`${leitor}`.as("leitor"),
      orgaoId: sql<number>`${vStg.orgao}`.as("orgao_id"),
      reparticaoId: sql<number | null>`${vStg.reparticao}`.as("reparticao_id"),
      cardId: sql<number>`${card}`.as("card_id"),
    })
    .from(empenhosStaging)
    .where(and(eq(empenhosStaging.loteId, loteId), stagingVinculado(card)));
  const atualizar = Object.fromEntries(
    [...COMPARADOS, "loteId", "removidoEm", "leitor", "orgaoId", "reparticaoId"].map((c) => [c, sql.raw(`excluded.${colunaSql(c)}`)]),
  );
  return [
    db
      .insert(empenhos)
      .select(sel as never)
      // Só regrava o que MUDOU (o "atualizado" do resumo é real; o empenho igual guarda a data e o lote de antes).
      .onConflictDoUpdate({
        target: [empenhos.cardId, empenhos.chave],
        set: { ...atualizar, atualizadoEm: sql`CURRENT_TIMESTAMP` },
        setWhere: mudou(colEmp, (c) => sql.raw(`excluded."${colunaSql(c)}"`), sql`excluded."leitor"`, sql`excluded."orgao_id"`, sql`excluded."reparticao_id"`),
      }),
    regra === "apagar"
      ? db.delete(empenhos).where(sumiram(db, loteId, card, ano))
      : db.update(empenhos).set({ removidoEm: sql`CURRENT_TIMESTAMP`, atualizadoEm: sql`CURRENT_TIMESTAMP` }).where(sumiram(db, loteId, card, ano)),
    db.delete(empenhos).where(and(eq(empenhos.cardId, card), eq(empenhos.ano, ano), sql`${vEmp.orgao} IS NULL`)),
    db
      .update(centiLotes)
      .set({ estado: "promovido", ...contagem, mensagem: null, condutor: null, conduzindoAte: null, concluidoEm: sql`CURRENT_TIMESTAMP`, vistoEm: sql`CURRENT_TIMESTAMP` })
      .where(eq(centiLotes.id, loteId)),
    db.delete(empenhosStaging).where(eq(empenhosStaging.loteId, loteId)),
    db.delete(centiStagingFora).where(eq(centiStagingFora.loteId, loteId)),
    // A leitura fragmentada da automática (e os fragmentos, em cascata) que ficou no meio.
    db.delete(centiLeituras).where(eq(centiLeituras.loteId, loteId)),
  ] as const;
}

/** Fecha o lote sem promover (parcial, falhou ou cancelado) e limpa o staging — a tabela final não muda. */
export function comandosFecharLote(db: Db, loteId: number, estado: "parcial" | "falhou" | "cancelado" | "unidades", mensagem: string) {
  return [
    db.update(centiLotes).set({ estado, mensagem, condutor: null, conduzindoAte: null, concluidoEm: sql`CURRENT_TIMESTAMP`, vistoEm: sql`CURRENT_TIMESTAMP` }).where(eq(centiLotes.id, loteId)),
    db.delete(empenhosStaging).where(eq(empenhosStaging.loteId, loteId)),
    db.delete(liquidacoesStaging).where(eq(liquidacoesStaging.loteId, loteId)),
    db.delete(pagamentosStaging).where(eq(pagamentosStaging.loteId, loteId)),
    db.delete(centiStagingFora).where(eq(centiStagingFora.loteId, loteId)),
  ] as const;
}

/** A coluna SQL de um campo (camelCase → snake_case). */
function colunaSql(c: string): string {
  return c.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

/**
 * EXCLUI tentativas de importação DO BANCO — VÁRIAS num lote só (os ids num parâmetro JSON, só as DESTE card): os passos,
 * o staging e os lotes. Os empenhos (e as liquidações e os pagamentos) que elas já promoveram ficam (são os dados do município) — só
 * perdem a referência ao lote. O ÚLTIMO comando devolve os lotes excluídos. Um comando por tabela, qualquer que seja o
 * número de importações: excluir várias de uma vez cabe no limite de consultas do Worker.
 */
export function comandosExcluirLotes(db: Db, cardId: number, loteIds: number[]) {
  const ids = sql`(SELECT ${centiLotes.id} FROM ${centiLotes} WHERE ${centiLotes.cardId} = ${cardId} AND ${centiLotes.id} IN (SELECT value FROM json_each(${JSON.stringify([...new Set(loteIds)])})))`;
  return [
    db.update(empenhos).set({ loteId: null }).where(sql`${empenhos.loteId} IN ${ids}`),
    db.update(liquidacoes).set({ loteId: null }).where(sql`${liquidacoes.loteId} IN ${ids}`),
    db.delete(liquidacoesStaging).where(sql`${liquidacoesStaging.loteId} IN ${ids}`),
    db.update(pagamentos).set({ loteId: null }).where(sql`${pagamentos.loteId} IN ${ids}`),
    db.delete(pagamentosStaging).where(sql`${pagamentosStaging.loteId} IN ${ids}`),
    db.delete(empenhosStaging).where(sql`${empenhosStaging.loteId} IN ${ids}`),
    db.delete(centiStagingFora).where(sql`${centiStagingFora.loteId} IN ${ids}`),
    db.delete(centiLotePassos).where(sql`${centiLotePassos.loteId} IN ${ids}`),
    db.delete(centiLotes).where(sql`${centiLotes.id} IN ${ids}`).returning({ id: centiLotes.id, ano: centiLotes.ano, estado: centiLotes.estado }),
  ];
}

/**
 * Exclui PASSOS do lote (vários de uma vez — os ids num parâmetro JSON). O passo lido também sai: o período dele volta a
 * faltar e é lido de novo ao continuar (o que já está no staging fica — a releitura não duplica).
 */
export function comandoExcluirPassos(db: Db, loteId: number, ids: number[]) {
  return db
    .delete(centiLotePassos)
    .where(and(eq(centiLotePassos.loteId, loteId), sql`${centiLotePassos.id} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`))
    .returning({ id: centiLotePassos.id });
}
