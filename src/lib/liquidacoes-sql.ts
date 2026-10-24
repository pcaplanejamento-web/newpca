import { and, count, desc, eq, isNull, ne, notInArray, or, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { centiLotes, centiStagingFora, empenhos, liquidacoes, liquidacoesStaging } from "../db/schema.ts";
import type { RegraRemovidos } from "./empenho-cards-core.ts";
import { MAX_JSON_GUARDA } from "./empenhos-sql.ts";
import { chaveEmpenhoDaLiquidacao, LIMITE_VALOR_LIQUIDACAO, type LinhaLiquidacao } from "./liquidacoes-core.ts";

/**
 * LIQUIDAÇÕES — os comandos da importação como BUILDERS do Drizzle (testados pelo driver D1 REAL — `tests/liquidacoes.test.ts`),
 * no MESMO padrão dos empenhos (`empenhos-sql.ts`): a página num ÚNICO parâmetro JSON, a promoção num lote atômico. O
 * vínculo é o do EMPENHO: só entra a liquidação cujo empenho (órgão gestor + número) está no card.
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

/** Os empenhos do card (órgão gestor + número) entre os pedidos — as chaves de `chaveEmpenhoDaLiquidacao` que existem. */
export async function empenhosNoCard(db: Db, card: number, pares: { orgao: string; numeroEmpenho: string }[]): Promise<Set<string>> {
  const chaves = [...new Set(pares.map((p) => chaveEmpenhoDaLiquidacao(p.orgao, p.numeroEmpenho)))];
  if (!chaves.length) return new Set();
  const r = await db
    .selectDistinct({ c: sql<string>`${empenhos.orgaoGestor} || char(31) || ${empenhos.numero}` })
    .from(empenhos)
    .where(and(eq(empenhos.cardId, card), sql`(${empenhos.orgaoGestor} || char(31) || ${empenhos.numero}) IN (SELECT value FROM json_each(${JSON.stringify(chaves)}))`));
  return new Set(r.map((x) => x.c));
}

/** Guarda as liquidações da página no STAGING (SÓ as de empenho do card — quem chama filtra), em pedaços de JSON. */
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

/** O EMPENHO do card de uma linha do staging (o mais recente com o mesmo órgão gestor e número) — null = sem vínculo. */
const empenhoDaLinha = (card: number) =>
  sql`(SELECT ${empenhos.id} FROM ${empenhos} WHERE ${empenhos.cardId} = ${card} AND ${empenhos.orgaoGestor} = "liquidacoes_staging"."orgao" AND ${empenhos.numero} = "liquidacoes_staging"."numero_empenho" ORDER BY ${empenhos.ano} DESC LIMIT 1)`;
const stagingVinculado = (card: number) => sql`${empenhoDaLinha(card)} IS NOT NULL`;

const chavesVinculadas = (db: Db, loteId: number, card: number) =>
  db.select({ c: liquidacoesStaging.chave }).from(liquidacoesStaging).where(and(eq(liquidacoesStaging.loteId, loteId), stagingVinculado(card)));

/** As liquidações do card, do ano e do órgão da Centi que a Centi não trouxe mais. */
const sumiram = (db: Db, loteId: number, card: number, ano: number, idOrgao: number) =>
  and(
    eq(liquidacoes.cardId, card),
    eq(liquidacoes.ano, ano),
    eq(liquidacoes.idOrgaoCenti, idOrgao),
    isNull(liquidacoes.removidoEm),
    notInArray(liquidacoes.chave, chavesVinculadas(db, loteId, card)),
  );

const COMPARADOS = CAMPOS.filter((c) => c !== "chave");
const colLiq = (c: string) => sql.raw(`"liquidacoes"."${colunaSql(c)}"`);
const colStg = (c: string) => sql.raw(`"liquidacoes_staging"."${colunaSql(c)}"`);

function mudou(atual: (c: string) => SQL, novo: (c: string) => SQL, leitorNovo: SQL, empenhoNovo: SQL): SQL {
  return sql.join(
    [
      ...COMPARADOS.map((c) => sql`${atual(c)} IS NOT ${novo(c)}`),
      sql`${atual("empenhoId")} IS NOT ${empenhoNovo}`,
      sql`${atual("removidoEm")} IS NOT NULL`,
      sql`${atual("leitor")} IS NOT ${leitorNovo}`,
    ],
    sql` OR `,
  );
}

/** O resumo da promoção: novas, atualizadas de fato, removidas (não vieram mais) e as FORA (sem o empenho no card). */
export async function contagemLiquidacoes(db: Db, loteId: number, card: number, ano: number, idOrgao: number, leitor: number) {
  const [novos] = await db
    .select({ n: count() })
    .from(liquidacoesStaging)
    .where(
      and(
        eq(liquidacoesStaging.loteId, loteId),
        stagingVinculado(card),
        sql`NOT EXISTS (SELECT 1 FROM ${liquidacoes} WHERE ${liquidacoes.cardId} = ${card} AND ${liquidacoes.chave} = ${liquidacoesStaging.chave})`,
      ),
    );
  const [alterados] = await db
    .select({ n: count() })
    .from(liquidacoesStaging)
    .innerJoin(liquidacoes, and(eq(liquidacoes.cardId, card), eq(liquidacoes.chave, liquidacoesStaging.chave)))
    .where(and(eq(liquidacoesStaging.loteId, loteId), stagingVinculado(card), mudou(colLiq, colStg, sql`${leitor}`, empenhoDaLinha(card))));
  const [removidos] = await db.select({ n: count() }).from(liquidacoes).where(sumiram(db, loteId, card, ano, idOrgao));
  const [perdeu] = await db
    .select({ n: count() })
    .from(liquidacoesStaging)
    .where(and(eq(liquidacoesStaging.loteId, loteId), sql`NOT (${stagingVinculado(card)})`));
  const [contados] = await db.select({ n: count() }).from(centiStagingFora).where(eq(centiStagingFora.loteId, loteId));
  return { inseridos: novos.n, atualizados: alterados.n, removidos: removidos.n, fora: perdeu.n + contados.n };
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
 * PROMOVE o lote de liquidações conferido, num lote ATÔMICO: grava/atualiza as liquidações cujo EMPENHO está no card
 * (com o id do empenho), trata as que a Centi não trouxe mais (do mesmo ano e órgão) pela REGRA do card, fecha o lote e
 * limpa o staging.
 */
export function comandosPromoverLiquidacoes(
  db: Db,
  loteId: number,
  card: number,
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
      empenhoId: sql<number>`${empenhoDaLinha(card)}`.as("empenho_id"),
      cardId: sql<number>`${card}`.as("card_id"),
      loteId: liquidacoesStaging.loteId,
      removidoEm: sql<string | null>`NULL`.as("removido_em"),
      leitor: sql<number>`${leitor}`.as("leitor"),
      criadoEm: sql<string>`CURRENT_TIMESTAMP`.as("criado_em"),
      atualizadoEm: sql<string>`CURRENT_TIMESTAMP`.as("atualizado_em"),
    })
    .from(liquidacoesStaging)
    .where(and(eq(liquidacoesStaging.loteId, loteId), stagingVinculado(card)));
  const atualizar = Object.fromEntries([...COMPARADOS, "idOrgaoCenti", "empenhoId", "loteId", "removidoEm", "leitor"].map((c) => [c, sql.raw(`excluded.${colunaSql(c)}`)]));
  return [
    db
      .insert(liquidacoes)
      .select(sel as never)
      .onConflictDoUpdate({
        target: [liquidacoes.cardId, liquidacoes.chave],
        set: { ...atualizar, atualizadoEm: sql`CURRENT_TIMESTAMP` },
        setWhere: mudou(colLiq, (c) => sql.raw(`excluded."${colunaSql(c)}"`), sql`excluded."leitor"`, sql`excluded."empenho_id"`),
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
