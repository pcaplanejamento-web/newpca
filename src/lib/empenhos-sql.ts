import { and, count, desc, eq, isNull, ne, notInArray, or, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { centiLotePassos, centiLotes, empenhos, empenhosStaging } from "../db/schema.ts";
import { LIMITE_VALOR_EMPENHO, type LinhaEmpenho, type PassoLote, type Periodo, SEGUNDOS_CONDUCAO } from "./empenhos-core.ts";

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

/** Guarda a página no STAGING: as linhas em pedaços de até `MAX_JSON_GUARDA` caracteres, cada um num parâmetro JSON. */
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
export function comandoRegistrarPasso(db: Db, loteId: number, p: Omit<PassoLote, "id" | "em">) {
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
      unicos: sql`(SELECT COUNT(*) FROM ${empenhosStaging} WHERE ${empenhosStaging.loteId} = ${loteId})`,
      soma: sql`(SELECT SUM(${empenhosStaging.valorEmpenhado}) FROM ${empenhosStaging} WHERE ${empenhosStaging.loteId} = ${loteId})`,
      totalInformado: sql`(SELECT CASE WHEN COUNT(t) = COUNT(*) THEN SUM(t) END FROM (SELECT MAX(${centiLotePassos.total}) AS t FROM ${centiLotePassos} WHERE ${ok} GROUP BY ${centiLotePassos.inicio}, ${centiLotePassos.fim}))`,
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

/** Quantas destas chaves o lote JÁ tem no staging (os "novos" de uma página = as que faltavam). Um parâmetro só. */
export async function jaNoLote(db: Db, loteId: number, chaves: string[]): Promise<number> {
  if (!chaves.length) return 0;
  const [r] = await db
    .select({ n: count() })
    .from(empenhosStaging)
    .where(and(eq(empenhosStaging.loteId, loteId), sql`${empenhosStaging.chave} IN (SELECT value FROM json_each(${JSON.stringify(chaves)}))`));
  return r?.n ?? 0;
}

/** Os campos comparados para saber se um empenho MUDOU (todos menos a chave). */
const COMPARADOS = CAMPOS.filter((c) => c !== "chave");

/** "Mudou": algum campo diferente (`IS NOT` — nulo conta), o empenho estava removido ou foi lido por outro leitor. */
function mudou(atual: (c: string) => SQL, novo: (c: string) => SQL, leitorNovo: SQL): SQL {
  return sql.join(
    [...COMPARADOS.map((c) => sql`${atual(c)} IS NOT ${novo(c)}`), sql`${atual("removidoEm")} IS NOT NULL`, sql`${atual("leitor")} IS NOT ${leitorNovo}`],
    sql` OR `,
  );
}
const colEmp = (c: string) => sql.raw(`"empenhos"."${colunaSql(c)}"`);

/** Quantos empenhos o lote cria, ATUALIZA DE FATO (algum valor mudou) e marca como removidos — o resumo do lote. */
export async function contagemDaPromocao(db: Db, loteId: number, ano: number, leitor: number) {
  const [novos] = await db
    .select({ n: count() })
    .from(empenhosStaging)
    .where(and(eq(empenhosStaging.loteId, loteId), sql`NOT EXISTS (SELECT 1 FROM ${empenhos} WHERE ${empenhos.chave} = ${empenhosStaging.chave})`));
  const [alterados] = await db
    .select({ n: count() })
    .from(empenhosStaging)
    .innerJoin(empenhos, eq(empenhos.chave, empenhosStaging.chave))
    .where(and(eq(empenhosStaging.loteId, loteId), mudou(colEmp, (c) => sql.raw(`"empenhos_staging"."${colunaSql(c)}"`), sql`${leitor}`)));
  const [removidos] = await db
    .select({ n: count() })
    .from(empenhos)
    .where(and(eq(empenhos.ano, ano), isNull(empenhos.removidoEm), notInArray(empenhos.chave, db.select({ c: empenhosStaging.chave }).from(empenhosStaging).where(eq(empenhosStaging.loteId, loteId)))));
  return { inseridos: novos.n, atualizados: alterados.n, removidos: removidos.n };
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

/** A última importação CONCLUÍDA do mesmo ano (a base da conferência de queda), sem o próprio lote. */
export async function ultimoPromovido(db: Db, apiChave: string, ano: number, exceto: number) {
  const [l] = await db
    .select({ soma: centiLotes.soma, unicos: centiLotes.unicos })
    .from(centiLotes)
    .where(and(eq(centiLotes.apiChave, apiChave), eq(centiLotes.ano, ano), eq(centiLotes.estado, "promovido"), ne(centiLotes.id, exceto)))
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

/**
 * PROMOVE o lote conferido, num lote ATÔMICO: grava/atualiza os empenhos (o que reaparece perde o `removido_em`), marca
 * `removido_em` no que o ano tinha e a Centi não trouxe mais (nada é apagado), fecha o lote e limpa o staging.
 */
export function comandosPromover(db: Db, loteId: number, ano: number, leitor: number, contagem: { inseridos: number; atualizados: number; removidos: number }) {
  const sel = db
    .select({
      id: sql<number>`NULL`.as("id"),
      ...Object.fromEntries(CAMPOS.map((c) => [c, empenhosStaging[c]])),
      loteId: empenhosStaging.loteId,
      removidoEm: sql<string | null>`NULL`.as("removido_em"),
      criadoEm: sql<string>`CURRENT_TIMESTAMP`.as("criado_em"),
      atualizadoEm: sql<string>`CURRENT_TIMESTAMP`.as("atualizado_em"),
      leitor: sql<number>`${leitor}`.as("leitor"),
    })
    .from(empenhosStaging)
    .where(eq(empenhosStaging.loteId, loteId));
  const atualizar = Object.fromEntries(
    [...COMPARADOS, "loteId", "removidoEm", "leitor"].map((c) => [c, sql.raw(`excluded.${colunaSql(c)}`)]),
  );
  return [
    db
      .insert(empenhos)
      .select(sel as never)
      // Só regrava o que MUDOU (o "atualizado" do resumo é real; o empenho igual guarda a data e o lote de antes).
      .onConflictDoUpdate({ target: empenhos.chave, set: { ...atualizar, atualizadoEm: sql`CURRENT_TIMESTAMP` }, setWhere: mudou(colEmp, (c) => sql.raw(`excluded."${colunaSql(c)}"`), sql`excluded."leitor"`) }),
    db
      .update(empenhos)
      .set({ removidoEm: sql`CURRENT_TIMESTAMP`, atualizadoEm: sql`CURRENT_TIMESTAMP` })
      .where(
        and(eq(empenhos.ano, ano), isNull(empenhos.removidoEm), notInArray(empenhos.chave, db.select({ c: empenhosStaging.chave }).from(empenhosStaging).where(eq(empenhosStaging.loteId, loteId)))),
      ),
    db
      .update(centiLotes)
      .set({ estado: "promovido", ...contagem, mensagem: null, condutor: null, conduzindoAte: null, concluidoEm: sql`CURRENT_TIMESTAMP`, vistoEm: sql`CURRENT_TIMESTAMP` })
      .where(eq(centiLotes.id, loteId)),
    db.delete(empenhosStaging).where(eq(empenhosStaging.loteId, loteId)),
  ] as const;
}

/** Fecha o lote sem promover (parcial, falhou ou cancelado) e limpa o staging — a tabela final não muda. */
export function comandosFecharLote(db: Db, loteId: number, estado: "parcial" | "falhou" | "cancelado", mensagem: string) {
  return [
    db.update(centiLotes).set({ estado, mensagem, condutor: null, conduzindoAte: null, concluidoEm: sql`CURRENT_TIMESTAMP`, vistoEm: sql`CURRENT_TIMESTAMP` }).where(eq(centiLotes.id, loteId)),
    db.delete(empenhosStaging).where(eq(empenhosStaging.loteId, loteId)),
  ] as const;
}

/** A coluna SQL de um campo (camelCase → snake_case). */
function colunaSql(c: string): string {
  return c.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

/**
 * EXCLUI a tentativa de importação DO BANCO: os passos, o staging e o próprio lote. Os empenhos que ela já promoveu
 * ficam (são os dados do município) — só perdem a referência ao lote.
 */
export function comandosExcluirLote(db: Db, loteId: number) {
  return [
    db.update(empenhos).set({ loteId: null }).where(eq(empenhos.loteId, loteId)),
    db.delete(empenhosStaging).where(eq(empenhosStaging.loteId, loteId)),
    db.delete(centiLotePassos).where(eq(centiLotePassos.loteId, loteId)),
    db.delete(centiLotes).where(eq(centiLotes.id, loteId)).returning({ id: centiLotes.id }),
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
