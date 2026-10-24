import { type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type AnoEmpenhos, CAMPOS_DICIONARIO, type EscopoEmpenhos, COLUNA_SQL, COLUNA_VALOR, EMPENHOS_POR_PEDACO, escopoVazio, VALORES_EMPENHO } from "./empenhos-tela-core.ts";

/**
 * As CONSULTAS da tela de empenhos (testadas no D1 real sobre `node:sqlite` — `tests/empenhos-tela.test.ts`). O JSON
 * compacto sai PRONTO do banco: cada campo ganha um DICIONÁRIO (os valores distintos do ano, numerados na ordem — CTE
 * `dN`) e cada empenho vira uma tupla com os NÚMEROS (junção com `IS`, que casa também o vazio). As tuplas vêm em pedaços
 * de `EMPENHOS_POR_PEDACO` (cada texto abaixo do teto de 2 MB do D1), pedidos em paralelo. Cada consulta devolve a
 * VERSÃO dos empenhos do ano (`ver`, a última importação promovida): uma importação concluída no meio muda os números do dicionário — a leitura é
 * refeita (`textoPacoteEmpenhos`). Os nomes de coluna vêm só de `COLUNA_SQL`/`COLUNA_VALOR` — nunca texto de fora.
 */
// biome-ignore lint/suspicious/noExplicitAny: o schema do Drizzle não importa aqui (o mesmo banco de `getDb`).
type Db = DrizzleD1Database<any>;

/**
 * O ESCOPO da pessoa: o empenho vinculado a uma das suas unidades ou — vínculo só ao órgão — a um órgão delas (dois
 * parâmetros JSON). `prefixo` = o alias da tabela.
 */
export const doEscopo = (escopo: EscopoEmpenhos, prefixo = ""): SQL =>
  escopo === null
    ? sql`1`
    : sql.join(
        [
          sql.raw(`(${prefixo}reparticao_id IN (SELECT value FROM json_each(`),
          sql`${JSON.stringify(escopo.unidades)}`,
          sql.raw(`)) OR (${prefixo}reparticao_id IS NULL AND ${prefixo}orgao_id IN (SELECT value FROM json_each(`),
          sql`${JSON.stringify(escopo.orgaos)}`,
          sql.raw("))))"),
        ],
        sql.raw(""),
      );

/** O recorte: o card, o ano, vigentes × removidos e o escopo da pessoa. */
const onde = (card: number, ano: number, removidos: boolean, escopo: EscopoEmpenhos): SQL => {
  const base = removidos ? sql`card_id = ${card} AND ano = ${ano} AND removido_em IS NOT NULL` : sql`card_id = ${card} AND ano = ${ano} AND removido_em IS NULL`;
  return escopo === null ? base : sql.join([base, sql.raw(" AND "), doEscopo(escopo)], sql.raw(""));
};

/**
 * A VERSÃO dos empenhos do ano no card = a última importação PROMOVIDA dele + a data dos vínculos do card — os empenhos
 * só mudam na promoção de um lote (atômico: os empenhos e o estado "promovido" no MESMO comando) ou quando os vínculos
 * mudam (no mesmo lote da data), então a versão nova chega junto dos dados.
 */
const versaoSql = (card: number, ano: number): SQL =>
  sql`((SELECT IFNULL(MAX(id), 0) FROM centi_lotes WHERE card_id = ${card} AND ano = ${ano} AND estado = 'promovido') || ':' || (SELECT IFNULL(vinculos_em, '') FROM empenho_cards WHERE id = ${card}))`;

export async function consultaVersaoEmpenhos(db: Db, card: number, ano: number): Promise<string> {
  const [r] = await db.all<{ ver: string }>(sql.join([sql.raw("SELECT "), versaoSql(card, ano), sql.raw(" AS ver")], sql.raw("")));
  return String(r?.ver ?? "");
}

const versao = (card: number, ano: number): SQL => sql.join([versaoSql(card, ano), sql.raw(" AS ver")], sql.raw(""));

/** A SIGLA da unidade do cadastro vinculada ao empenho; vinculado só ao órgão, a sigla do órgão (o filtro padrão de unidade). */
const UNIDADE_SISTEMA =
  "COALESCE((SELECT r.codigo FROM reparticoes r WHERE r.id = empenhos.reparticao_id), (SELECT o.sigla FROM orgaos o WHERE o.id = empenhos.orgao_id))";

/** `WITH base AS (os empenhos do recorte, numerados pelo id), d0 AS (…), …` — o MESMO prefixo nas consultas. */
function prefixo(card: number, ano: number, removidos: boolean, escopo: EscopoEmpenhos): SQL {
  const dics = CAMPOS_DICIONARIO.map(
    (c, k) => `d${k} AS (SELECT v, row_number() OVER (ORDER BY v) - 1 AS i FROM (SELECT DISTINCT ${COLUNA_SQL[c]} AS v FROM base))`,
  ).join(", ");
  return sql.join([sql.raw(`WITH base AS (SELECT empenhos.*, ${UNIDADE_SISTEMA} AS unidade_sistema, row_number() OVER (ORDER BY empenhos.id) AS rn FROM empenhos WHERE `), onde(card, ano, removidos, escopo), sql.raw(`), ${dics} `)], sql.raw(""));
}

/** Os anos com empenhos no card: quantos (vigentes), a soma empenhada, quantos removidos na Centi e a última promoção. */
export async function consultaAnosEmpenhos(db: Db, card: number, escopo: EscopoEmpenhos = null): Promise<AnoEmpenhos[]> {
  const so = escopo === null ? sql`` : sql.join([sql.raw("AND "), doEscopo(escopo, "e.")], sql.raw(""));
  const l = await db.all<{ ano: number; n: number; soma: number | null; removidos: number; atualizado: string | null }>(sql`
    SELECT e.ano AS ano,
      SUM(CASE WHEN e.removido_em IS NULL THEN 1 ELSE 0 END) AS n,
      SUM(CASE WHEN e.removido_em IS NULL THEN e.valor_empenhado ELSE 0 END) AS soma,
      SUM(CASE WHEN e.removido_em IS NOT NULL THEN 1 ELSE 0 END) AS removidos,
      (SELECT MAX(l.concluido_em) FROM centi_lotes l WHERE l.card_id = e.card_id AND l.ano = e.ano AND l.estado = 'promovido') AS atualizado
    FROM empenhos e WHERE e.card_id = ${card} ${so} GROUP BY e.ano ORDER BY e.ano DESC`);
  return l.map((a) => ({ ano: Number(a.ano), n: Number(a.n), soma: Number(a.soma ?? 0), removidos: Number(a.removidos), atualizadoEm: a.atualizado }));
}

/** A contagem (`n`), a versão e o DICIONÁRIO de todos os campos num JSON só (`j`): {"fonte":[[0,"1.00 - …"],…],…}. */
function sqlDicionario(card: number, ano: number, removidos: boolean, escopo: EscopoEmpenhos): SQL {
  const campos = CAMPOS_DICIONARIO.map((c, k) => `'${c}', (SELECT json_group_array(json_array(i, v)) FROM d${k})`).join(", ");
  return sql.join([prefixo(card, ano, removidos, escopo), sql.raw(`SELECT (SELECT COUNT(*) FROM base) AS n, json_object(${campos}) AS j, `), versao(card, ano)], sql.raw(""));
}

/** Um PEDAÇO das tuplas [id, número, números do dicionário…, valores…], já em JSON. */
function sqlPedaco(card: number, ano: number, removidos: boolean, escopo: EscopoEmpenhos, pedaco: number): SQL {
  const tupla = ["e.id", "e.numero", ...CAMPOS_DICIONARIO.map((_, k) => `d${k}.i`), ...VALORES_EMPENHO.map((v) => `e.${COLUNA_VALOR[v]}`)].join(", ");
  const juncoes = CAMPOS_DICIONARIO.map((c, k) => `LEFT JOIN d${k} ON d${k}.v IS e.${COLUNA_SQL[c]}`).join(" ");
  const de = pedaco * EMPENHOS_POR_PEDACO;
  return sql.join(
    [
      prefixo(card, ano, removidos, escopo),
      sql.raw(`SELECT (SELECT json_group_array(json_array(${tupla})) FROM (SELECT * FROM base WHERE rn > `),
      sql`${de} AND rn <= ${de + EMPENHOS_POR_PEDACO}`,
      sql.raw(`) e ${juncoes}) AS j, `),
      versao(card, ano),
    ],
    sql.raw(""),
  );
}

/** Uma leitura completa: o dicionário e os pedaços — `null` quando os empenhos mudaram no meio (versões diferentes). */
async function lerPacote(db: Db, card: number, ano: number, removidos: boolean, escopo: EscopoEmpenhos): Promise<string | null> {
  const [d] = await db.all<{ n: number; j: string; ver: string }>(sqlDicionario(card, ano, removidos, escopo));
  const n = Number(d?.n ?? 0);
  const pedacos = Math.ceil(n / EMPENHOS_POR_PEDACO);
  const textos = await Promise.all(Array.from({ length: pedacos }, (_, p) => db.all<{ j: string; ver: string }>(sqlPedaco(card, ano, removidos, escopo, p))));
  if (textos.some((r) => String(r[0]?.ver) !== String(d?.ver))) return null;
  const corpo = textos
    .map((r) => (r[0]?.j ?? "[]").slice(1, -1))
    .filter((t) => t.length > 0)
    .join(",");
  return `{"n":${n},"dic":${d?.j ?? "{}"},"linhas":[${corpo}]}`;
}

/**
 * O PACOTE de um ano do card já como TEXTO JSON ({"n","dic","linhas"}) — o Worker não lê nem refaz nada: só costura os textos do
 * banco. Os empenhos mudaram no meio (uma importação concluída agora)? Lê de novo, até 3 vezes; depois, `null`.
 */
export async function textoPacoteEmpenhos(db: Db, card: number, ano: number, removidos: boolean, escopo: EscopoEmpenhos = null): Promise<string | null> {
  if (escopoVazio(escopo)) return '{"n":0,"dic":{},"linhas":[]}';
  for (let i = 0; i < 3; i++) {
    const t = await lerPacote(db, card, ano, removidos, escopo);
    if (t != null) return t;
  }
  return null;
}
