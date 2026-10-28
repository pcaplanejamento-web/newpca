import { and, count, desc, eq, getTableColumns, inArray, isNotNull, isNull, ne, notInArray, or, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { centiLeituras, centiLotePassos, centiLotes, centiOrgaosGestores, empenhos, empenhosStaging, liquidacoes, liquidacoesStaging, pagamentos, pagamentosStaging } from "../db/schema.ts";
import { comandoAlteracoesDoLote, comandoAlteracoesSumiram } from "./centi-alteracoes-sql.ts";
import type { RegraRemovidos } from "./empenho-cards-core.ts";
import { vinculoSql } from "./empenho-cards-sql.ts";
import { LIMITE_VALOR_EMPENHO, type LinhaEmpenho, type PassoNovo, type Periodo, SEGUNDOS_CONDUCAO } from "./empenhos-core.ts";
import type { ParIgual } from "./importacao-partes-core.ts";

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

/** Os EMPENHOS na conferência pela assinatura (`comandosConferirAssinatura`). */
export const CONF_EMPENHOS: ConfTabela = { tabela: "empenhos", campos: CAMPOS, soma: `e."valor_empenhado"` };

/** Teto de caracteres do JSON de UM comando de guarda — o D1 recusa texto acima de 2 MB (com folga para os acentos). */
export const MAX_JSON_GUARDA = 600_000;

/** Teto de caracteres do JSON de UMA conferência — a página entra em mais de um ponto do mesmo comando. */
export const MAX_JSON_CONFERIR = 150_000;

/** As linhas em pedaços de JSON (cada linha = a tupla dos `campos`), cada pedaço com até `max` caracteres. */
export function pedacosJson<L>(linhas: readonly L[], campos: readonly (keyof L)[], max: number): string[] {
  const pedacos: string[] = [];
  let atual: string[] = [];
  let tamanho = 0;
  for (const l of linhas) {
    const j = JSON.stringify(campos.map((c) => l[c]));
    if (atual.length && tamanho + j.length > max) {
      pedacos.push(`[${atual.join(",")}]`);
      atual = [];
      tamanho = 0;
    }
    atual.push(j);
    tamanho += j.length + 1;
  }
  if (atual.length) pedacos.push(`[${atual.join(",")}]`);
  return pedacos;
}

/**
 * A página como uma TABELA VIRTUAL com o NOME do staging (as mesmas colunas): as réguas escritas para o staging
 * (`mudou`, o vínculo, o destino) valem sobre as linhas lidas SEM gravá-las antes — o registro igual ao gravado nunca é
 * escrito no staging (cada escrita conta no limite diário do D1).
 */
export function tabelaVirtual(tabela: string, campos: readonly string[], json: string, extras: Record<string, number> = {}): SQL {
  const cols = campos.map((c, i) => sql.raw(`json_extract(value, '$[${i}]') AS "${colunaSql(c)}"`));
  const ext = Object.entries(extras).map(([c, v]) => sql.raw(`${Math.trunc(v)} AS "${colunaSql(c)}"`));
  return sql`(SELECT ${sql.join([...cols, ...ext], sql`, `)} FROM json_each(${json})) AS ${sql.raw(`"${tabela}"`)}`;
}

/** Os passos que VALEM no lote: a ÚLTIMA leitura (ok) de cada página — uma página relida não conta duas vezes. */
const passosQueValem = (loteId: number) =>
  sql`(SELECT MAX(q."id") FROM "centi_lote_passos" q WHERE q."lote_id" = ${loteId} AND q."estado" = 'ok' GROUP BY q."inicio", q."fim", q."pagina")`;

/** A coluna da LISTA de chaves do passo: as dos registros IGUAIS ao gravado ou as dos SEM vínculo/destino. */
export type ListaChaves = "iguais" | "fora";
const COLUNA_LISTA: Record<ListaChaves, string> = { iguais: "chaves_iguais", fora: "chaves_fora" };

/**
 * As CHAVES de uma lista do lote (`SELECT value` — para `IN`/`NOT IN`): as das páginas que VALEM (`passosQueValem`); com
 * `todas`, as de qualquer leitura do lote fora dos períodos divididos (o "já visto" da página em andamento).
 */
export function chavesDaLista(loteId: number, lista: ListaChaves, todas = false): SQL {
  const col = sql.raw(`p."${COLUNA_LISTA[lista]}"`);
  const quais = todas ? sql`p."lote_id" = ${loteId} AND p."estado" <> 'dividido'` : sql`p."id" IN ${passosQueValem(loteId)}`;
  return sql`(SELECT j."value" FROM "centi_lote_passos" p, json_each(COALESCE(${col}, '[]')) j WHERE ${quais})`;
}

/**
 * A lista do passo com as chaves de `fonte` (um SELECT com a coluna `c`), sem repetir — UMA escrita por página, qualquer que
 * seja o número de registros (antes: uma linha por registro igual ou sem vínculo, o limite diário de escritas do D1).
 */
export function listaMais(lista: ListaChaves, fonte: SQL): SQL {
  const col = sql.raw(`"centi_lote_passos"."${COLUNA_LISTA[lista]}"`);
  return sql`(SELECT json_group_array("c") FROM (SELECT "value" AS "c" FROM json_each(COALESCE(${col}, '[]')) UNION SELECT "c" FROM (${fonte})))`;
}

/** As chaves de um JSON como fonte da `listaMais`. */
export const chavesDoJson = (chaves: readonly string[]) => sql`SELECT "value" AS "c" FROM json_each(${JSON.stringify(chaves)})`;

/** Só as chaves dos SEM VÍNCULO à lista do passo (a leitura só do catálogo — nada é conferido nem guardado). */
export function comandoChavesFora(db: Db, loteId: number, chaves: readonly string[], passo?: number) {
  return db
    .update(centiLotePassos)
    .set({ chavesFora: listaMais("fora", chavesDoJson(chaves)) })
    .where(eq(centiLotePassos.id, passo ?? ultimoPasso(loteId)));
}

/** Uma linha com a ASSINATURA dos dados (`hashTupla` — calculada no servidor sobre a linha conferida). */
export type ComHash<L> = L & { hash?: string | null };

/** A tabela FINAL de um tipo (o staging é `<tabela>_staging`) e o que a conferência precisa dela. */
export type ConfTabela = {
  tabela: "empenhos" | "liquidacoes" | "pagamentos";
  campos: readonly string[];
  /** Colunas a mais do staging, com o mesmo valor em toda a página (o órgão da Centi das liquidações e dos pagamentos). */
  extras?: Record<string, number>;
  /** O registro (no staging/tabela virtual) tem DESTINO — sem ele não é guardado (liquidações e pagamentos). */
  destino?: SQL;
  /** O valor do registro gravado `e` que entra na SOMA do passo. */
  soma: string;
};

const STAGING = { empenhos: empenhosStaging, liquidacoes: liquidacoesStaging, pagamentos: pagamentosStaging } as const;

/** O GRAVADO `e` é IGUAL ao lido: a mesma assinatura e valendo (nem removido nem ausente — esses voltam pela promoção). */
const valeIgual = (h: SQL) => sql`e."hash" IS ${h} AND e."removido_em" IS NULL AND e."ausente_desde_lote" IS NULL`;

/**
 * Guarda a página no STAGING, em pedaços de até `MAX_JSON_GUARDA` caracteres (as linhas com a assinatura). Com `card` (a
 * leitura de verdade), só entra o que NÃO é igual ao gravado — e, com destino, só o que tem destino.
 */
export function comandosGuardarStaging(db: Db, c: ConfTabela, loteId: number, pagina: number, linhas: readonly ComHash<object>[], card?: number) {
  const nome = `${c.tabela}_staging`;
  const cols = [...c.campos, "hash"];
  return pedacosJson(linhas as unknown as readonly Record<string, unknown>[], cols, MAX_JSON_GUARDA).map((json) => {
    const virt = tabelaVirtual(nome, cols, json, c.extras);
    const col = (x: string) => sql.raw(`"${nome}"."${colunaSql(x)}"`);
    // As chaves na MESMA ordem das colunas da tabela (exigência do insert…select).
    const sel = db.select({
      loteId: sql<number>`${loteId}`.as("lote_id"),
      pagina: sql<number>`${pagina}`.as("pagina"),
      ...Object.fromEntries([...c.campos, ...Object.keys(c.extras ?? {}), "hash"].map((x) => [x, sql`${col(x)}`.as(x)])),
    });
    const q =
      card == null
        ? sel.from(virt).where(sql`1`)
        : sel
            .from(sql`${virt} LEFT JOIN ${sql.raw(`"${c.tabela}"`)} e ON e."card_id" = ${card} AND e."chave" = ${col("chave")} AND ${valeIgual(col("hash"))}`)
            // O WHERE também desfaz a ambiguidade do SQLite entre "SELECT … ON CONFLICT" e a junção.
            .where(c.destino ? sql`e."id" IS NULL AND ${c.destino}` : sql`e."id" IS NULL`);
    return db.insert(STAGING[c.tabela]).select(q as never).onConflictDoNothing();
  });
}

/** A página de EMPENHOS no staging (sem conferir — a base dos testes e da leitura antiga). */
export function comandosGuardarPagina(db: Db, loteId: number, pagina: number, linhas: readonly ComHash<LinhaEmpenho>[]) {
  return comandosGuardarStaging(db, CONF_EMPENHOS, loteId, pagina, linhas);
}

/**
 * GUARDA e CONFERE EM TEMPO REAL uma página pela ASSINATURA dos dados, num lote só — o que custa CPU e escrita é só o que
 * MUDOU: `linhas` = os registros inteiros (cada um com a `hash` calculada no servidor), `iguais` = os PARES (chave +
 * assinatura) que o navegador já viu iguais ao gravado, `fora` = as chaves dos sem vínculo (empenhos; nos de destino, o
 * próprio SQL separa). O passo recebe o RESULTADO (novos · alterados · iguais · sem vínculo) e as LISTAS das chaves (uma
 * escrita por página); o staging recebe só o novo e o diferente. Os PARES são conferidos NO BANCO (`comandoParesIguais`, nos
 * comandos `depois` — depois de o passo receber a soma da parte): o par que não confere não entra em lista nenhuma e a
 * conferência do lote acusa a falta (nada é promovido pela metade).
 */
export function comandosConferirAssinatura(
  db: Db,
  c: ConfTabela,
  loteId: number,
  card: number,
  pagina: number,
  linhas: readonly ComHash<object & { chave: string }>[],
  iguais: readonly ParIgual[],
  fora: readonly string[],
  passo?: number,
): { cmds: unknown[]; depois: unknown[] } {
  const nome = `${c.tabela}_staging`;
  const cols = [...c.campos, "hash"];
  const tab = sql.raw(`"${c.tabela}"`);
  const chaveStg = sql.raw(`"${nome}"."chave"`);
  const hashStg = sql.raw(`"${nome}"."hash"`);
  const alvo = eq(centiLotePassos.id, passo ?? ultimoPasso(loteId));
  const comDestino = c.destino ? sql` AND ${c.destino}` : sql``;
  const pedacos = pedacosJson(linhas as unknown as readonly Record<string, unknown>[], cols, MAX_JSON_CONFERIR);
  const cmds: unknown[] = pedacos.map((json, i) => {
    const virt = () => tabelaVirtual(nome, cols, json, c.extras);
    const junto = (cond: SQL) => sql`FROM ${virt()} JOIN ${tab} e ON e."card_id" = ${card} AND e."chave" = ${chaveStg} WHERE ${cond}${comDestino}`;
    const semDestino = c.destino
      ? {
          resSemVinculo: sql`COALESCE(${centiLotePassos.resSemVinculo}, 0) + (SELECT COUNT(*) FROM ${virt()} WHERE NOT (${c.destino}))`,
          chavesFora: listaMais("fora", sql`SELECT ${chaveStg} AS "c" FROM ${virt()} WHERE NOT (${c.destino})`),
        }
      : i === 0
        ? { resSemVinculo: sql`COALESCE(${centiLotePassos.resSemVinculo}, 0) + ${fora.length}`, ...(fora.length ? { chavesFora: listaMais("fora", chavesDoJson(fora)) } : {}) }
        : {};
    return db
      .update(centiLotePassos)
      .set({
        resNovos: sql`COALESCE(${centiLotePassos.resNovos}, 0) + (SELECT COUNT(*) FROM ${virt()} WHERE NOT EXISTS (SELECT 1 FROM ${tab} e WHERE e."card_id" = ${card} AND e."chave" = ${chaveStg})${comDestino})`,
        resAlterados: sql`COALESCE(${centiLotePassos.resAlterados}, 0) + (SELECT COUNT(*) ${junto(sql`NOT (${valeIgual(hashStg)})`)})`,
        resIguais: sql`COALESCE(${centiLotePassos.resIguais}, 0) + (SELECT COUNT(*) ${junto(valeIgual(hashStg))})`,
        chavesIguais: listaMais("iguais", sql`SELECT ${chaveStg} AS "c" ${junto(valeIgual(hashStg))}`),
        ...semDestino,
      })
      .where(alvo);
  });
  if (!pedacos.length) cmds.push(comandoResultadoVazio(db, loteId, c.destino ? [] : fora, passo));
  // O que uma leitura ANTERIOR da página guardou sai (vale a desta leitura — também o que agora veio igual).
  const todas = [...linhas.map((l) => l.chave), ...iguais.map((p) => p[0])];
  if (todas.length) cmds.push(db.delete(STAGING[c.tabela]).where(and(eq(STAGING[c.tabela].loteId, loteId), sql`${STAGING[c.tabela].chave} IN (SELECT value FROM json_each(${JSON.stringify(todas)}))`)));
  cmds.push(...comandosGuardarStaging(db, c, loteId, pagina, linhas, card));
  return { cmds, depois: iguais.length ? [comandoParesIguais(db, c, loteId, card, iguais, passo)] : [] };
}

/**
 * Os PARES (chave + assinatura) que o navegador viu iguais ao gravado, CONFERIDOS NO BANCO: só o que bate (a mesma
 * assinatura, valendo) entra nos iguais do passo — e a SOMA do passo recebe o valor GRAVADO deles (é o mesmo da Centi).
 */
export function comandoParesIguais(db: Db, c: ConfTabela, loteId: number, card: number, iguais: readonly ParIgual[], passo?: number) {
  const junto = sql`FROM (SELECT json_extract(value, '$[0]') AS "chave", json_extract(value, '$[1]') AS "hash" FROM json_each(${JSON.stringify(iguais)})) AS p JOIN ${sql.raw(`"${c.tabela}"`)} e ON e."card_id" = ${card} AND e."chave" = p."chave" AND ${valeIgual(sql.raw(`p."hash"`))}`;
  return db
    .update(centiLotePassos)
    .set({
      resIguais: sql`COALESCE(${centiLotePassos.resIguais}, 0) + (SELECT COUNT(*) ${junto})`,
      chavesIguais: listaMais("iguais", sql`SELECT p."chave" AS "c" ${junto}`),
      soma: sql`COALESCE(${centiLotePassos.soma}, 0) + (SELECT COALESCE(SUM(${sql.raw(c.soma)}), 0) ${junto})`,
    })
    .where(eq(centiLotePassos.id, passo ?? ultimoPasso(loteId)));
}

/**
 * As ASSINATURAS gravadas do card no ano (chave → assinatura), como UM texto JSON montado NO BANCO — o navegador baixa no
 * começo da importação e manda inteiro só o que mudou. Só os registros valendo (o removido e o ausente voltam inteiros).
 */
export function consultaAssinaturas(db: Db, tabela: ConfTabela["tabela"], card: number, ano: number) {
  const t = sql.raw(`"${tabela}"`);
  return db
    .select({ j: sql<string>`(SELECT json_group_object("chave", "hash") FROM ${t} WHERE "card_id" = ${card} AND "ano" = ${ano} AND "hash" IS NOT NULL AND "removido_em" IS NULL AND "ausente_desde_lote" IS NULL)` })
    .from(sql`(SELECT 1)`);
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
  const ultimas = sql`(SELECT MAX(${centiLotePassos.id}) FROM ${centiLotePassos} WHERE ${ok} GROUP BY ${centiLotePassos.inicio}, ${centiLotePassos.fim}, ${centiLotePassos.pagina})`;
  return db
    .update(centiLotes)
    .set({
      paginas: sql`(SELECT COUNT(*) FROM ${centiLotePassos} WHERE ${ok})`,
      // A ÚLTIMA leitura de cada página (uma página relida não conta duas vezes).
      recebidos: sql`(SELECT COALESCE(SUM(${centiLotePassos.recebidos}), 0) FROM ${centiLotePassos} WHERE ${centiLotePassos.id} IN ${ultimas})`,
      recusados: sql`(SELECT COALESCE(SUM(${centiLotePassos.recusados}), 0) FROM ${centiLotePassos} WHERE ${centiLotePassos.id} IN ${ultimas})`,
      // Os ÚNICOS = os guardados (com vínculo) + os só contados (sem vínculo — a chave); a SOMA = a de TODOS os registros
      // lidos (a última leitura de cada página), a mesma régua das importações anteriores na conferência de queda.
      // (o lote de LIQUIDAÇÕES guarda no staging dele — um lote é de um tipo só, a soma dos dois é o do lote)
      unicos: sql`((SELECT COUNT(*) FROM ${empenhosStaging} WHERE ${empenhosStaging.loteId} = ${loteId}) + (SELECT COUNT(*) FROM ${liquidacoesStaging} WHERE ${liquidacoesStaging.loteId} = ${loteId}) + (SELECT COUNT(*) FROM ${pagamentosStaging} WHERE ${pagamentosStaging.loteId} = ${loteId})
        + (SELECT COUNT(*) FROM (SELECT "value" FROM ${chavesDaLista(loteId, "iguais")} UNION SELECT "value" FROM ${chavesDaLista(loteId, "fora")}) WHERE "value" NOT IN ${chavesDoStaging(loteId)}))`,
      // FORA = só os sem vínculo/destino (as chaves dos IGUAIS ao gravado contam nos únicos, não aqui).
      fora: sql`(SELECT COUNT(DISTINCT "value") FROM ${chavesDaLista(loteId, "fora")} WHERE "value" NOT IN ${chavesDoStaging(loteId)})`,
      soma: sql`(SELECT SUM(${centiLotePassos.soma}) FROM ${centiLotePassos} WHERE ${centiLotePassos.id} IN ${ultimas})`,
      // POR ÓRGÃO (liquidações, pagamentos e os empenhos lidos por órgão): cada "página" é um órgão com o PRÓPRIO total (lidos em
      // paralelo) — o do período é a soma deles (a última leitura de cada órgão); empenhos: o maior total informado em cada período.
      totalInformado: sql`(CASE WHEN ${centiLotes.modo} IN ('liquidacoes', 'pagamentos') OR ${centiLotes.orgaosCenti} IS NOT NULL
        THEN (SELECT CASE WHEN COUNT(t) = COUNT(*) THEN SUM(t) END FROM (SELECT ${centiLotePassos.total} AS t FROM ${centiLotePassos} WHERE ${centiLotePassos.id} IN ${ultimas}))
        ELSE (SELECT CASE WHEN COUNT(t) = COUNT(*) THEN SUM(t) END FROM (SELECT MAX(${centiLotePassos.total}) AS t FROM ${centiLotePassos} WHERE ${ok} GROUP BY ${centiLotePassos.inicio}, ${centiLotePassos.fim})) END)`,
      vistoEm: sql`CURRENT_TIMESTAMP`,
    })
    .where(and(eq(centiLotes.id, loteId), eq(centiLotes.estado, "lendo")));
}

/** As chaves GUARDADAS do lote (o staging do tipo dele — um lote é de um tipo só). */
const chavesDoStaging = (loteId: number) =>
  sql`(SELECT "chave" FROM "empenhos_staging" WHERE "lote_id" = ${loteId} UNION ALL SELECT "chave" FROM "liquidacoes_staging" WHERE "lote_id" = ${loteId} UNION ALL SELECT "chave" FROM "pagamentos_staging" WHERE "lote_id" = ${loteId})`;

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
  // UMA consulta (o staging e as listas do lote): cada requisição da importação conta as consultas (plano gratuito: 50).
  const [r] = await db
    .select({ n: sql<number>`(SELECT COUNT(*) FROM ${lista} WHERE "value" IN ${chavesDoStaging(loteId)} OR "value" IN ${chavesDaLista(loteId, "iguais", true)} OR "value" IN ${chavesDaLista(loteId, "fora", true)})` })
    .from(sql`(SELECT 1)`);
  return Number(r?.n ?? 0);
}

/** Os campos comparados para saber se um empenho MUDOU (todos menos a chave). */
const COMPARADOS = CAMPOS.filter((c) => c !== "chave");

/** "Mudou": algum campo diferente (`IS NOT` — nulo conta), o vínculo mudou, o empenho estava removido ou AUSENTE (volta) ou foi
 * lido por outro leitor. */
function mudou(atual: (c: string) => SQL, novo: (c: string) => SQL, leitorNovo: SQL, orgaoNovo: SQL, reparticaoNovo: SQL): SQL {
  return sql.join(
    [
      ...COMPARADOS.map((c) => sql`${atual(c)} IS NOT ${novo(c)}`),
      sql`${atual("orgaoId")} IS NOT ${orgaoNovo}`,
      sql`${atual("reparticaoId")} IS NOT ${reparticaoNovo}`,
      sql`${atual("removidoEm")} IS NOT NULL`,
      sql`${atual("ausenteDesdeLote")} IS NOT NULL`,
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


/**
 * Os empenhos do card e do ano que a Centi não trouxe mais (fora das chaves vinculadas e das iguais do lote). Na leitura POR
 * ÓRGÃO (`orgaos`), só os dos órgãos gestores dos IDs lidos (o mapa) — o órgão que não foi pedido nunca "some".
 */
const sumiram = (db: Db, loteId: number, card: number, ano: number, orgaos: readonly number[] | null) =>
  and(
    eq(empenhos.cardId, card),
    eq(empenhos.ano, ano),
    isNull(empenhos.removidoEm),
    notInArray(empenhos.chave, chavesVinculadas(db, loteId, card)),
    notInArray(empenhos.chave, chavesDaLista(loteId, "iguais")),
    orgaos ? inArray(empenhos.orgaoGestor, db.select({ g: centiOrgaosGestores.orgaoGestor }).from(centiOrgaosGestores).where(sql`${centiOrgaosGestores.idCenti} IN (SELECT value FROM json_each(${JSON.stringify(orgaos)}))`)) : undefined,
  );

/** As colunas do passo SEM as listas de chaves (que podem ter milhares) — o que a tela e a leitura usam. */
const { chavesIguais: _iguais, chavesFora: _fora, ...COLUNAS_PASSO } = getTableColumns(centiLotePassos);
export { COLUNAS_PASSO };
export type LinhaPasso = Omit<typeof centiLotePassos.$inferSelect, "chavesIguais" | "chavesFora">;

/** O passo mais recente do lote (o que a página acabou de registrar no mesmo lote). */
export const ultimoPasso = (loteId: number) => sql`(SELECT MAX("id") FROM "centi_lote_passos" WHERE "lote_id" = ${loteId})`;

/** Lê o passo mais recente do lote — o último comando do lote da página (já com o resultado da conferência). */
export function consultaUltimoPasso(db: Db, loteId: number, passo?: number) {
  return db.select(COLUNAS_PASSO).from(centiLotePassos).where(eq(centiLotePassos.id, passo ?? ultimoPasso(loteId)));
}

/** O resultado da página SEM registros a conferir (só os sem vínculo, ou nenhum): os contadores existem (zero) e as chaves
 * dos sem vínculo vão à lista do passo. */
export function comandoResultadoVazio(db: Db, loteId: number, fora: readonly string[], passo?: number) {
  const mais = (c: (typeof centiLotePassos)["resNovos" | "resAlterados" | "resIguais" | "resSemVinculo"], n: number) => sql`COALESCE(${c}, 0) + ${n}`;
  return db
    .update(centiLotePassos)
    .set({
      resNovos: mais(centiLotePassos.resNovos, 0),
      resAlterados: mais(centiLotePassos.resAlterados, 0),
      resIguais: mais(centiLotePassos.resIguais, 0),
      resSemVinculo: mais(centiLotePassos.resSemVinculo, fora.length),
      ...(fora.length ? { chavesFora: listaMais("fora", chavesDoJson(fora)) } : {}),
    })
    .where(eq(centiLotePassos.id, passo ?? ultimoPasso(loteId)));
}

/**
 * Quantos empenhos o lote cria, ATUALIZA DE FATO (algum valor ou o vínculo mudou), deixa AUSENTES (a 1ª importação sem
 * eles — seguem valendo), REMOVE (a 2ª: a regra dos removidos) — e quantos registros ficam FORA (unidade da Centi sem vínculo: não são gravados) — o resumo do lote.
 */
export async function contagemDaPromocao(db: Db, loteId: number, card: number, ano: number, leitor: number, orgaos: readonly number[] | null = null) {
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
  const [removidos] = await db.select({ n: count() }).from(empenhos).where(and(loteLendo(loteId), sumiram(db, loteId, card, ano, orgaos), isNotNull(empenhos.ausenteDesdeLote)));
  const [ausentes] = await db.select({ n: count() }).from(empenhos).where(and(loteLendo(loteId), sumiram(db, loteId, card, ano, orgaos), isNull(empenhos.ausenteDesdeLote)));
  // FORA = os só contados na leitura + os guardados que perderam o vínculo antes da conclusão (não entram).
  const [perdeu] = await db
    .select({ n: count() })
    .from(empenhosStaging)
    .where(and(eq(empenhosStaging.loteId, loteId), sql`NOT (${stagingVinculado(card)})`));
  const [contados] = await db.select({ n: sql<number>`COUNT(DISTINCT "value")` }).from(sql`${chavesDaLista(loteId, "fora")}`).where(sql`"value" NOT IN ${chavesDoStaging(loteId)}`);
  return { inseridos: novos.n, atualizados: alterados.n, removidos: removidos.n, ausentes: ausentes.n, fora: perdeu.n + Number(contados?.n ?? 0) };
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

/** A última importação CONCLUÍDA do mesmo card e ano (a base da conferência de queda), sem o próprio lote — e com os MESMOS
 * órgãos (a leitura por órgão soma só os órgãos lidos: comparar com a do ano inteiro acusaria uma queda falsa). */
export async function ultimoPromovido(db: Db, card: number, ano: number, exceto: number, orgaos: readonly number[] | null = null) {
  const [l] = await db
    .select({ soma: centiLotes.soma, unicos: centiLotes.unicos })
    .from(centiLotes)
    .where(
      and(
        eq(centiLotes.cardId, card),
        eq(centiLotes.ano, ano),
        eq(centiLotes.estado, "promovido"),
        ne(centiLotes.id, exceto),
        orgaos ? eq(centiLotes.orgaosCenti, JSON.stringify(orgaos)) : isNull(centiLotes.orgaosCenti),
      ),
    )
    .orderBy(desc(centiLotes.id))
    .limit(1);
  return l ?? null;
}

/** Quantos empenhos VIGENTES do card e do ano são dos órgãos gestores destes IDs (o mapa) — a base da 1ª leitura por órgão. */
export async function vigentesDosOrgaos(db: Db, card: number, ano: number, orgaos: readonly number[]): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(empenhos)
    .where(
      and(
        eq(empenhos.cardId, card),
        eq(empenhos.ano, ano),
        isNull(empenhos.removidoEm),
        inArray(empenhos.orgaoGestor, db.select({ g: centiOrgaosGestores.orgaoGestor }).from(centiOrgaosGestores).where(sql`${centiOrgaosGestores.idCenti} IN (SELECT value FROM json_each(${JSON.stringify(orgaos)}))`)),
      ),
    );
  return r?.n ?? 0;
}

/**
 * TRAVA de quem conduz o lote (uma aba por vez): a aba com o token entra se o lote está livre, já é dela ou a trava
 * venceu (`SEGUNDOS_CONDUCAO` sem notícia); cada página renova. Devolve a linha quando conseguiu.
 */
export function comandoConduzir(db: Db, loteId: number, condutor: string) {
  return db
    .update(centiLotes)
    .set({ condutor, conduzindoAte: sql`datetime('now', ${`+${SEGUNDOS_CONDUCAO} seconds`})`, vistoEm: sql`CURRENT_TIMESTAMP` })
    .where(
      and(
        eq(centiLotes.id, loteId),
        eq(centiLotes.estado, "lendo"),
        or(isNull(centiLotes.condutor), eq(centiLotes.condutor, condutor), isNull(centiLotes.conduzindoAte), sql`${centiLotes.conduzindoAte} < datetime('now')`),
      ),
    )
    .returning({ id: centiLotes.id });
}

/** Segundos da trava da EXECUÇÃO automática (a espera pela Centi é de até 30 s; a execução que caiu não prende o lote). */
export const SEGUNDOS_EXECUCAO_AUTO = 90;

/** TRAVA a execução automática no lote (o cron roda DUAS vezes por minuto): a linha volta só para quem a pegou. */
export function comandoTravarAuto(db: Db, loteId: number) {
  return db
    .update(centiLotes)
    .set({ autoAte: sql`datetime('now', ${`+${SEGUNDOS_EXECUCAO_AUTO} seconds`})`, vistoEm: sql`CURRENT_TIMESTAMP` })
    .where(and(eq(centiLotes.id, loteId), eq(centiLotes.estado, "lendo"), or(isNull(centiLotes.autoAte), sql`${centiLotes.autoAte} < datetime('now')`)))
    .returning({ id: centiLotes.id, ate: centiLotes.autoAte });
}

/** SOLTA a trava da execução automática (o fim da execução — a próxima pode seguir) — só se ainda for a DESTA execução
 * (`ate` = o que ela gravou): a que passou do prazo nunca solta a trava de outra que já a pegou. */
export function comandoSoltarAuto(db: Db, loteId: number, ate: string | null) {
  return db
    .update(centiLotes)
    .set({ autoAte: null })
    .where(and(eq(centiLotes.id, loteId), ate == null ? isNull(centiLotes.autoAte) : eq(centiLotes.autoAte, ate)));
}

/** SOLTA a trava de quem conduz (a leitura parou numa falha): o lote segue ABERTO — qualquer aba continua de onde parou. */
export function comandoSoltarLote(db: Db, loteId: number, condutor: string) {
  return db
    .update(centiLotes)
    .set({ condutor: null, conduzindoAte: null, vistoEm: sql`CURRENT_TIMESTAMP` })
    .where(and(eq(centiLotes.id, loteId), eq(centiLotes.estado, "lendo"), eq(centiLotes.condutor, condutor)));
}

/**
 * O lote ainda está LENDO — a guarda da PROMOÇÃO: o lote atômico só marca como removido (ou apaga) o que a Centi não trouxe
 * enquanto o lote não foi promovido. Uma 2ª promoção do MESMO lote (o pedido repetido pela rede) encontra o staging já
 * limpo — sem a guarda, TUDO do ano "teria sumido". O último comando do lote o fecha; os anteriores veem "lendo".
 */
export function loteLendo(loteId: number) {
  return sql`EXISTS (SELECT 1 FROM ${centiLotes} WHERE ${centiLotes.id} = ${loteId} AND ${centiLotes.estado} = 'lendo')`;
}

/** A contagem da promoção (o resumo do lote). */
export type ContagemPromocao = { inseridos: number; atualizados: number; removidos: number; ausentes: number; fora: number };

/**
 * O que a Centi NÃO trouxe, em DOIS tempos (a resposta incompleta nunca apaga nada de uma vez): a 1ª importação sem o
 * registro só o deixa AUSENTE (`ausente_desde_lote`, segue valendo); a próxima importação concluída sem ele aplica a REGRA
 * dos removidos (marca `removido_em` ou apaga). Os comandos, NA ORDEM, depois do upsert (o que voltou já saiu da ausência).
 */
export function comandosAusencia<T extends typeof empenhos | typeof liquidacoes | typeof pagamentos>(db: Db, tabela: T, loteId: number, regra: RegraRemovidos, onde: SQL | undefined) {
  const t = tabela as typeof empenhos;
  const confirmados = and(loteLendo(loteId), onde, isNotNull(t.ausenteDesdeLote));
  return [
    regra === "apagar"
      ? db.delete(t).where(confirmados)
      : db.update(t).set({ removidoEm: sql`CURRENT_TIMESTAMP`, atualizadoEm: sql`CURRENT_TIMESTAMP` }).where(confirmados),
    // A 1ª ausência só marca a importação (o `removido_em` da regra "marcar" já tirou os confirmados do `onde`).
    db.update(t).set({ ausenteDesdeLote: loteId }).where(and(loteLendo(loteId), onde, isNull(t.ausenteDesdeLote))),
  ] as const;
}

/**
 * PROMOVE o lote conferido, num lote ATÔMICO: registra no HISTÓRICO o que mudou (antes de mudar), grava/atualiza os empenhos
 * VINCULADOS do card (com o órgão/unidade do cadastro; o que reaparece perde o `removido_em` e a ausência), trata o que o card
 * tinha no ano e a Centi não trouxe mais em dois tempos (`comandosAusencia`), APAGA o que ficou sem vínculo (banco limpo),
 * fecha o lote e limpa o staging.
 */
export function comandosPromover(
  db: Db,
  loteId: number,
  card: number,
  ano: number,
  leitor: number,
  regra: RegraRemovidos,
  contagem: ContagemPromocao,
  orgaos: readonly number[] | null = null,
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
      ausenteDesdeLote: sql<number | null>`NULL`.as("ausente_desde_lote"),
      hash: empenhosStaging.hash,
    })
    .from(empenhosStaging)
    .where(and(eq(empenhosStaging.loteId, loteId), stagingVinculado(card)));
  const atualizar = Object.fromEntries(
    [...COMPARADOS, "loteId", "removidoEm", "leitor", "orgaoId", "reparticaoId", "ausenteDesdeLote", "hash"].map((c) => [c, sql.raw(`excluded.${colunaSql(c)}`)]),
  );
  const sumiu = sumiram(db, loteId, card, ano, orgaos);
  return [
    // O HISTÓRICO primeiro (o valor de ANTES ainda está gravado).
    comandoAlteracoesDoLote(db, "empenho", { final: "empenhos", staging: "empenhos_staging", campos: COMPARADOS }, loteId, card, and(loteLendo(loteId), stagingVinculado(card)) as SQL),
    comandoAlteracoesSumiram(db, "empenho", "empenhos", loteId, card, and(loteLendo(loteId), sumiu) as SQL),
    db
      .insert(empenhos)
      .select(sel as never)
      // Só regrava o que MUDOU (o "atualizado" do resumo é real; o empenho igual guarda a data e o lote de antes).
      .onConflictDoUpdate({
        target: [empenhos.cardId, empenhos.chave],
        set: { ...atualizar, atualizadoEm: sql`CURRENT_TIMESTAMP` },
        // (ou só a ASSINATURA, a 1ª vez — o registro de antes da assinatura passa a tê-la.)
        setWhere: sql`${mudou(colEmp, (c) => sql.raw(`excluded."${colunaSql(c)}"`), sql`excluded."leitor"`, sql`excluded."orgao_id"`, sql`excluded."reparticao_id"`)} OR "empenhos"."hash" IS NOT excluded."hash"`,
      }),
    ...comandosAusencia(db, empenhos, loteId, regra, sumiu),
    db.delete(empenhos).where(and(loteLendo(loteId), eq(empenhos.cardId, card), eq(empenhos.ano, ano), sql`${vEmp.orgao} IS NULL`)),
    db
      .update(centiLotes)
      .set({ estado: "promovido", ...contagem, mensagem: null, condutor: null, conduzindoAte: null, concluidoEm: sql`CURRENT_TIMESTAMP`, vistoEm: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(centiLotes.id, loteId), eq(centiLotes.estado, "lendo"))),
    db.delete(empenhosStaging).where(eq(empenhosStaging.loteId, loteId)),
    // A leitura fragmentada da automática (e os fragmentos, em cascata) que ficou no meio.
    db.delete(centiLeituras).where(eq(centiLeituras.loteId, loteId)),
  ] as const;
}

/** Fecha o lote que ainda LÊ sem promover (parcial, falhou ou cancelado) e limpa o staging — a tabela final não muda. */
export function comandosFecharLote(db: Db, loteId: number, estado: "parcial" | "falhou" | "cancelado" | "unidades", mensagem: string) {
  return [
    db.update(centiLotes).set({ estado, mensagem, condutor: null, conduzindoAte: null, concluidoEm: sql`CURRENT_TIMESTAMP`, vistoEm: sql`CURRENT_TIMESTAMP` })
      // Só o lote que ainda LÊ: um fechamento atrasado (abandono, outra aba) nunca rebaixa um lote já promovido.
      .where(and(eq(centiLotes.id, loteId), eq(centiLotes.estado, "lendo"))),
    db.delete(empenhosStaging).where(eq(empenhosStaging.loteId, loteId)),
    db.delete(liquidacoesStaging).where(eq(liquidacoesStaging.loteId, loteId)),
    db.delete(pagamentosStaging).where(eq(pagamentosStaging.loteId, loteId)),
    // A leitura fragmentada que ficou no meio (e os fragmentos, em cascata) — nada de texto grande sobrando no banco.
    db.delete(centiLeituras).where(eq(centiLeituras.loteId, loteId)),
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
