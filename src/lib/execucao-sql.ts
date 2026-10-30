import { type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type EscopoEmpenhos, escopoVazio } from "./empenhos-tela-core.ts";
import { doEscopo } from "./empenhos-tela-sql.ts";
import { DIMS_DICIONARIO, type DimDicionario, ESCALA, type MetaExec } from "./execucao-dash-core.ts";
import { limiteParado } from "./empenhos-core.ts";

/**
 * As CONSULTAS do Dashboard da EXECUÇÃO (testadas no D1 real sobre `node:sqlite` — `tests/execucao-sql.test.ts`). O
 * pacote sai PRONTO do banco, como o da tela de empenhos (`empenhos-tela-sql.ts`): o dicionário de cada dimensão e as
 * tuplas em JSON, em pedaços abaixo do teto de 2 MB do D1 — o Worker só costura os textos.
 *
 * O UNIVERSO (a ligação pelo número do empenho):
 * - Empenhos: os dos ANOS pedidos (`r` = 1) + os de outros anos citados pelas liquidações/pagamentos carregados (`r` = 0 —
 *   só classificam os restos a pagar; nunca entram no empenhado).
 * - Liquidações/pagamentos: os dos anos pedidos (cada etapa conta pela própria data).
 * - Vigentes (`removido_em IS NULL`), no ESCOPO da pessoa (`doEscopo`, a régua da tela de empenhos) e UMA vez por registro
 *   da Centi: a mesma `chave` em dois cards conta no card de id menor (`semRepetir`).
 * - O empenho de um número = o com unidade, de id menor (a régua de `destinoSql`).
 * - Valores em inteiros de 1/`ESCALA` de real, arredondados por registro. Dias = inteiros desde 2000-01-01.
 */
// biome-ignore lint/suspicious/noExplicitAny: o schema do Drizzle não importa aqui (o mesmo banco de `getDb`).
type Db = DrizzleD1Database<any>;

/** As etapas que a pessoa pode ver (a tela de cada uma). */
export type FontesSql = { liquidacoes: boolean; pagamentos: boolean };

/**
 * Quantas tuplas por pedaço (cada pedaço é UM texto do banco, abaixo de 2 MB): a tupla do empenho tem ~170 bytes com
 * valores grandes (5.000 ≈ 0,9 MB — folga para os índices altos do dicionário); a do evento, ~60 bytes.
 */
export const EMP_POR_PEDACO = 5_000;
export const EVENTOS_POR_PEDACO = 20_000;
/** Os tamanhos dos pedaços (os testes usam pedaços pequenos para conferir a costura). */
export type TamanhoPedacos = { emp: number; eventos: number };
const PEDACOS_PADRAO: TamanhoPedacos = { emp: EMP_POR_PEDACO, eventos: EVENTOS_POR_PEDACO };

/** A coluna de cada dimensão do dicionário (só estes nomes entram no SQL — nunca texto de fora). */
const COLUNA: Record<DimDicionario, string> = {
  unidade: "unidade_rotulo",
  orgaoGestor: "orgao_gestor",
  unidadeOrcamentaria: "unidade_orcamentaria",
  funcao: "funcao",
  subfuncao: "subfuncao",
  programa: "programa",
  acao: "acao",
  elemento: "elemento",
  subelemento: "subelemento",
  fonte: "fonte",
  modalidade: "modalidade",
  licitacao: "licitacao",
  fornecedor: "fornecedor",
};

/**
 * O RÓTULO da unidade do empenho, ÚNICO: a sigla da unidade do cadastro (com " — ÓRGÃO" quando a mesma sigla existe em
 * outra unidade); vinculado só ao órgão, a sigla do órgão (a coluna Unidade da tabela de empenhos).
 */
const UNIDADE_ROTULO = `CASE WHEN e.reparticao_id IS NULL THEN (SELECT COALESCE(NULLIF(o.sigla, ''), o.nome) FROM orgaos o WHERE o.id = e.orgao_id)
  ELSE (SELECT r.codigo || CASE WHEN EXISTS (SELECT 1 FROM reparticoes r2 WHERE r2.codigo = r.codigo AND r2.id <> r.id)
    THEN ' — ' || COALESCE((SELECT COALESCE(NULLIF(o.sigla, ''), o.nome) FROM orgaos o WHERE o.id = r.orgao_id), '') ELSE '' END
    FROM reparticoes r WHERE r.id = e.reparticao_id) END`;

const valor = (col: string) => `CAST(ROUND(${col} * ${ESCALA}) AS INTEGER)`;
const DIA = (col: string) => `CAST(julianday(${col}) - 2451544.5 AS INTEGER)`;

const juntar = (partes: (SQL | string)[]): SQL => sql.join(partes.map((p) => (typeof p === "string" ? sql.raw(p) : p)), sql.raw(""));

/** As CTEs comuns: anos, empenhos (universo, sem repetir, numerados), o empenho de cada número e os eventos agrupados. */
function ctes(anos: readonly number[], escopo: EscopoEmpenhos, f: FontesSql): SQL {
  const esc = (p: string) => doEscopo(escopo, p);
  const anosJ = JSON.stringify(anos);
  const anoNos = (col: string) => juntar([`${col} IN (SELECT value FROM json_each(`, sql`${anosJ}`, "))"]);
  // Os números citados pelos eventos dos anos pedidos (para trazer os empenhos de outros anos — restos a pagar).
  const citados: (SQL | string)[] = [];
  if (f.liquidacoes) citados.push(" OR e.numero IN (SELECT l2.numero_empenho FROM liquidacoes l2 WHERE l2.removido_em IS NULL AND ", anoNos("l2.ano"), " AND ", esc("l2."), ")");
  if (f.pagamentos) citados.push(" OR e.numero IN (SELECT p2.numero_empenho FROM pagamentos p2 WHERE p2.removido_em IS NULL AND ", anoNos("p2.ano"), " AND ", esc("p2."), ")");
  const partes: (SQL | string)[] = [
    "WITH empU AS (SELECT e.id, e.card_id, e.chave, e.numero, e.orgao_id, e.reparticao_id, e.data, ",
    DIMS_DICIONARIO.filter((d) => d !== "unidade")
      .map((d) => `e.${COLUNA[d]}`)
      .join(", "),
    `, (${UNIDADE_ROTULO}) AS unidade_rotulo, (`,
    anoNos("e.ano"),
    `) AS r, ${valor("e.valor_empenhado")} AS vb, ${valor("e.valor_anulado")} AS va, ${valor("e.valor_liquidado")} AS vl, ${valor("e.valor_pago")} AS vp, ${valor("e.saldo_pagar")} AS vs`,
    " FROM empenhos e WHERE e.removido_em IS NULL AND ",
    esc("e."),
    " AND (",
    anoNos("e.ano"),
    ...citados,
    ")), ",
    "emp AS (SELECT u.*, row_number() OVER (ORDER BY u.id) - 1 AS ix FROM (SELECT empU.*, row_number() OVER (PARTITION BY empU.chave ORDER BY empU.card_id) AS k FROM empU) u WHERE u.k = 1), ",
    "canon AS (SELECT c.numero, c.ix FROM (SELECT emp.numero, emp.ix, row_number() OVER (PARTITION BY emp.numero ORDER BY emp.reparticao_id IS NULL, emp.id) AS k FROM emp) c WHERE c.k = 1)",
  ];
  if (f.liquidacoes)
    partes.push(
      ", liqU AS (SELECT l.card_id, l.chave, l.numero_empenho, l.orgao_id, l.data, ",
      valor("l.valor"),
      " AS v, ",
      valor("l.valor_anulado"),
      " AS a FROM liquidacoes l WHERE l.removido_em IS NULL AND ",
      esc("l."),
      " AND ",
      anoNos("l.ano"),
      "), ",
      "liq AS (SELECT u.* FROM (SELECT liqU.*, row_number() OVER (PARTITION BY liqU.chave ORDER BY liqU.card_id) AS k FROM liqU) u WHERE u.k = 1), ",
      `lg AS (SELECT g.*, row_number() OVER (ORDER BY g.ei, g.d, g.o) AS rn FROM (SELECT COALESCE(c.ix, -1) AS ei, CASE WHEN c.ix IS NULL THEN liq.orgao_id END AS o, ${DIA("liq.data")} AS d, SUM(liq.v) AS v, SUM(liq.a) AS a, COUNT(*) AS n, SUM(CASE WHEN liq.a > 0 THEN 1 ELSE 0 END) AS na FROM liq LEFT JOIN canon c ON c.numero = liq.numero_empenho GROUP BY 1, 2, 3) g)`,
    );
  if (f.pagamentos)
    partes.push(
      ", pagU AS (SELECT p.card_id, p.chave, p.numero_empenho, p.orgao_id, p.data, p.anulado, ",
      valor("p.valor"),
      " AS v, ",
      valor("p.valor_retencao"),
      " AS rt, ",
      valor("p.valor_liquido"),
      " AS lq FROM pagamentos p WHERE p.removido_em IS NULL AND ",
      esc("p."),
      " AND ",
      anoNos("p.ano"),
      "), ",
      "pag AS (SELECT u.* FROM (SELECT pagU.*, row_number() OVER (PARTITION BY pagU.chave ORDER BY pagU.card_id) AS k FROM pagU) u WHERE u.k = 1), ",
      `pg AS (SELECT g.*, row_number() OVER (ORDER BY g.ei, g.d, g.o) AS rn FROM (SELECT COALESCE(c.ix, -1) AS ei, CASE WHEN c.ix IS NULL THEN pag.orgao_id END AS o, ${DIA("pag.data")} AS d,
        SUM(CASE WHEN pag.anulado = 0 THEN pag.v ELSE 0 END) AS v, SUM(CASE WHEN pag.anulado = 0 THEN pag.rt ELSE 0 END) AS rt,
        SUM(CASE WHEN pag.anulado = 0 THEN pag.lq ELSE 0 END) AS lq, SUM(CASE WHEN pag.anulado = 0 THEN 0 ELSE pag.v END) AS an,
        SUM(CASE WHEN pag.anulado = 0 THEN 1 ELSE 0 END) AS n, SUM(CASE WHEN pag.anulado = 0 THEN 0 ELSE 1 END) AS na
        FROM pag LEFT JOIN canon c ON c.numero = pag.numero_empenho GROUP BY 1, 2, 3) g)`,
    );
  // O dicionário de cada dimensão (os valores distintos, numerados em ordem).
  partes.push(
    ", ",
    DIMS_DICIONARIO.map((d, k) => `d${k} AS (SELECT v, row_number() OVER (ORDER BY v) - 1 AS i FROM (SELECT DISTINCT ${COLUNA[d]} AS v FROM emp))`).join(", "),
    " ",
  );
  return juntar(partes);
}

/**
 * A VERSÃO dos dados da Execução: a última importação promovida de QUALQUER card + a última mudança de vínculos + os
 * cards (criar/excluir um card leva ou tira dados sem lote novo).
 */
export const VERSAO_SQL =
  "((SELECT IFNULL(MAX(id), 0) FROM centi_lotes WHERE estado = 'promovido') || ':' || (SELECT IFNULL(MAX(vinculos_em), '') FROM empenho_cards) || ':' || (SELECT COUNT(*) || '.' || IFNULL(MAX(id), 0) FROM empenho_cards))";

export async function consultaVersaoExecucao(db: Db): Promise<string> {
  const [r] = await db.all<{ ver: string }>(sql.raw(`SELECT ${VERSAO_SQL} AS ver`));
  return String(r?.ver ?? "");
}

/** A versão de cada TIPO (empenhos ≠ liquidações ≠ pagamentos) + a do cadastro (nomes de órgãos/unidades): cada tela da
 * execução só pede de novo quando o que ELA mostra mudou — importar pagamentos não renova os empenhos. */
export type VersoesExecucao = { empenhos: string; liquidacoes: string; pagamentos: string; cadastro: string };

function versaoTipoSql(t: "empenhos" | "liquidacoes" | "pagamentos"): string {
  return `((SELECT COUNT(*) || '.' || IFNULL(MAX(l.id), 0) FROM centi_lotes l JOIN empenho_cards c ON c.id = l.card_id WHERE c.tipo = '${t}' AND l.estado = 'promovido') || ':' || (SELECT COUNT(*) || '.' || IFNULL(MAX(id), 0) || '.' || IFNULL(MAX(vinculos_em), '') FROM empenho_cards WHERE tipo = '${t}'))`;
}

export async function consultaVersoesExecucao(db: Db): Promise<VersoesExecucao> {
  const [r] = await db.all<{ e: string; l: string; p: string; c: number | null }>(
    sql.raw(
      `SELECT ${versaoTipoSql("empenhos")} AS e, ${versaoTipoSql("liquidacoes")} AS l, ${versaoTipoSql("pagamentos")} AS p, (SELECT MAX(id) FROM auditoria WHERE entidade IN ('orgao', 'reparticao')) AS c`,
    ),
  );
  return { empenhos: String(r?.e ?? ""), liquidacoes: String(r?.l ?? ""), pagamentos: String(r?.p ?? ""), cadastro: String(r?.c ?? 0) };
}

/** A versão de cada TELA da execução: a do que ela mostra (liquidações e pagamentos trazem o órgão/unidade do empenho). */
export function versaoDaTelaExecucao(v: VersoesExecucao, tela: "empenhos" | "liquidacoes" | "pagamentos" | "execucao"): string {
  const partes = tela === "empenhos" ? [v.empenhos] : tela === "execucao" ? [v.empenhos, v.liquidacoes, v.pagamentos] : [tela === "liquidacoes" ? v.liquidacoes : v.pagamentos, v.empenhos];
  return `${tela}|${partes.join("|")}|c${v.cadastro}`;
}

/** A situação de cada TIPO de card: quantos, a última importação promovida, lendo agora e com problema. */
/** `livres` = os cards da etapa sem importação concluída (podem atualizar já); `ultimaCompleta` = a mais antiga das concluídas. */
export type MetaSql = MetaExec & { livres: number; ultimaCompleta: string | null };

export async function consultaMetaExecucao(db: Db, parado = limiteParado()): Promise<MetaSql[]> {
  // "Lendo agora" = o lote com atividade recente (o PARADO há mais de 30 min é abandonado — `limiteParado`).
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(parado)) throw new Error("Limite inválido.");
  const l = await db.all<{ tipo: string; cards: number; atualizado: string | null; lendo: number; problemas: number; livres: number; ultimaCompleta: string | null }>(
    sql.raw(`SELECT c.tipo AS tipo, COUNT(*) AS cards,
      (SELECT MAX(l.concluido_em) FROM centi_lotes l JOIN empenho_cards c2 ON c2.id = l.card_id WHERE c2.tipo = c.tipo AND l.estado = 'promovido') AS atualizado,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM centi_lotes l WHERE l.card_id = c.id AND l.estado = 'lendo' AND l.visto_em >= '${parado}') THEN 1 ELSE 0 END) AS lendo,
      SUM(CASE WHEN c.ultimo_status IN ('falhou', 'parcial') THEN 1 ELSE 0 END) AS problemas,
      SUM(CASE WHEN c.ultimo_status = 'completo' AND c.ultima_execucao IS NOT NULL THEN 0 ELSE 1 END) AS livres,
      MIN(CASE WHEN c.ultimo_status = 'completo' THEN c.ultima_execucao END) AS ultimaCompleta
      FROM empenho_cards c GROUP BY c.tipo`),
  );
  return l
    .filter((m): m is typeof m & { tipo: MetaExec["tipo"] } => m.tipo === "empenhos" || m.tipo === "liquidacoes" || m.tipo === "pagamentos")
    .map((m) => ({ tipo: m.tipo, cards: Number(m.cards), atualizado: m.atualizado ?? null, lendo: Number(m.lendo), problemas: Number(m.problemas), livres: Number(m.livres), ultimaCompleta: m.ultimaCompleta ?? null }));
}

/** Os anos com empenhos no escopo (o seletor de anos — mais recente primeiro). */
export async function consultaAnosExecucao(db: Db, escopo: EscopoEmpenhos): Promise<number[]> {
  if (escopoVazio(escopo)) return [];
  const l = await db.all<{ ano: number }>(juntar(["SELECT DISTINCT e.ano AS ano FROM empenhos e WHERE e.removido_em IS NULL AND ", doEscopo(escopo, "e."), " ORDER BY e.ano DESC"]));
  return l.map((a) => Number(a.ano)).filter((a) => Number.isInteger(a));
}

const SEL_VERSAO = `, ${VERSAO_SQL} AS ver`;

/** A cabeça: quantos de cada, o dicionário e os órgãos citados. */
function sqlCabeca(anos: readonly number[], escopo: EscopoEmpenhos, f: FontesSql): SQL {
  const dic = DIMS_DICIONARIO.map((d, k) => `'${d}', (SELECT json_group_array(json_array(i, v)) FROM d${k})`).join(", ");
  const orgaosDe = ["SELECT orgao_id FROM emp", ...(f.liquidacoes ? ["SELECT o FROM lg"] : []), ...(f.pagamentos ? ["SELECT o FROM pg"] : [])].join(" UNION ");
  return juntar([
    ctes(anos, escopo, f),
    `SELECT (SELECT COUNT(*) FROM emp) AS ne, ${f.liquidacoes ? "(SELECT COUNT(*) FROM lg)" : "0"} AS nl, ${f.pagamentos ? "(SELECT COUNT(*) FROM pg)" : "0"} AS np, json_object(${dic}) AS dic,
      (SELECT json_group_array(json_array(o.id, COALESCE(NULLIF(o.sigla, ''), o.nome), o.nome)) FROM orgaos o WHERE o.id IN (${orgaosDe})) AS orgaos${SEL_VERSAO}`,
  ]);
}

function sqlEmpenhos(anos: readonly number[], escopo: EscopoEmpenhos, f: FontesSql, pedaco: number, por: number): SQL {
  const tupla = ["e.id", "e.numero", "e.r", "e.orgao_id", DIA("e.data"), ...DIMS_DICIONARIO.map((_, k) => `d${k}.i`), "e.vb", "e.va", "e.vl", "e.vp", "e.vs"].join(", ");
  const juncoes = DIMS_DICIONARIO.map((d, k) => `LEFT JOIN d${k} ON d${k}.v IS e.${COLUNA[d]}`).join(" ");
  const de = pedaco * por;
  return juntar([
    ctes(anos, escopo, f),
    `SELECT (SELECT json_group_array(json_array(${tupla})) FROM (SELECT * FROM emp WHERE ix >= `,
    sql`${de} AND ix < ${de + por}`,
    ` ORDER BY ix) e ${juncoes}) AS j${SEL_VERSAO}`,
  ]);
}

function sqlEventos(tipo: "lg" | "pg", anos: readonly number[], escopo: EscopoEmpenhos, f: FontesSql, pedaco: number, por: number): SQL {
  const tupla = tipo === "lg" ? "g.ei, g.o, g.d, g.v, g.a, g.n, g.na" : "g.ei, g.o, g.d, g.v, g.rt, g.lq, g.an, g.n, g.na";
  const de = pedaco * por;
  return juntar([
    ctes(anos, escopo, f),
    `SELECT (SELECT json_group_array(json_array(${tupla})) FROM (SELECT * FROM ${tipo} WHERE rn > `,
    sql`${de} AND rn <= ${de + por}`,
    ` ORDER BY rn) g) AS j${SEL_VERSAO}`,
  ]);
}

const corpo = (r: { j: string | null }[][]) =>
  r
    .map((x) => (x[0]?.j ?? "[]").slice(1, -1))
    .filter((t) => t.length > 0)
    .join(",");

/** Uma leitura completa — `null` quando os dados mudaram no meio (versões diferentes entre as consultas). */
async function lerUmaVez(db: Db, anos: readonly number[], escopo: EscopoEmpenhos, f: FontesSql, extra: string, tam: TamanhoPedacos): Promise<string | null> {
  const [c] = await db.all<{ ne: number; nl: number; np: number; dic: string; orgaos: string | null; ver: string }>(sqlCabeca(anos, escopo, f));
  const ne = Number(c?.ne ?? 0);
  const nl = Number(c?.nl ?? 0);
  const np = Number(c?.np ?? 0);
  const pedacos = (n: number, por: number) => Array.from({ length: Math.ceil(n / por) }, (_, p) => p);
  const [e, l, p] = await Promise.all([
    Promise.all(pedacos(ne, tam.emp).map((k) => db.all<{ j: string | null; ver: string }>(sqlEmpenhos(anos, escopo, f, k, tam.emp)))),
    Promise.all(pedacos(nl, tam.eventos).map((k) => db.all<{ j: string | null; ver: string }>(sqlEventos("lg", anos, escopo, f, k, tam.eventos)))),
    Promise.all(pedacos(np, tam.eventos).map((k) => db.all<{ j: string | null; ver: string }>(sqlEventos("pg", anos, escopo, f, k, tam.eventos)))),
  ]);
  if ([...e, ...l, ...p].some((r) => String(r[0]?.ver) !== String(c?.ver))) return null;
  return `{"v":${JSON.stringify(String(c?.ver ?? ""))},"dic":${c?.dic ?? "{}"},"orgaos":${c?.orgaos ?? "[]"},"emp":[${corpo(e)}],"liq":[${corpo(l)}],"pag":[${corpo(p)}]${extra}}`;
}

/**
 * O PACOTE da Execução como TEXTO JSON (`PacoteExec`). Os dados mudaram no meio (uma importação concluída agora)? Lê de
 * novo, até 3 vezes; depois, `null`. `extra` = os campos já serializados que vão junto (anos, fontes, meta).
 */
export async function textoPacoteExecucao(
  db: Db,
  anos: readonly number[],
  escopo: EscopoEmpenhos,
  f: FontesSql,
  extra = "",
  tam: TamanhoPedacos = PEDACOS_PADRAO,
): Promise<string | null> {
  if (escopoVazio(escopo) || !anos.length) return `{"v":"","dic":{},"orgaos":[],"emp":[],"liq":[],"pag":[]${extra}}`;
  for (let i = 0; i < 3; i++) {
    const t = await lerUmaVez(db, anos, escopo, f, extra, tam);
    if (t != null) return t;
  }
  return null;
}
