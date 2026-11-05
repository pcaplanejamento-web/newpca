import { type SQL, and, asc, eq, inArray, isNotNull, lt, gte, or, isNull, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type EscopoEmpenhos, escopoVazio } from "./empenhos-tela-core.ts";
import { doEscopo, loteMudou } from "./empenhos-tela-sql.ts";
import { DIMS_DICIONARIO, type DimDicionario, ESCALA, type MetaExec } from "./execucao-dash-core.ts";
import { limiteParado } from "./empenhos-core.ts";
import { execucaoPacotes } from "../db/schema.ts";

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
    "emp AS MATERIALIZED (SELECT u.*, row_number() OVER (ORDER BY u.id) - 1 AS ix FROM (SELECT empU.*, row_number() OVER (PARTITION BY empU.chave ORDER BY empU.card_id) AS k FROM empU) u WHERE u.k = 1), ",
    "canon AS MATERIALIZED (SELECT c.numero, c.ix FROM (SELECT emp.numero, emp.ix, row_number() OVER (PARTITION BY emp.numero ORDER BY emp.reparticao_id IS NULL, emp.id) AS k FROM emp) c WHERE c.k = 1)",
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
      `lg AS MATERIALIZED (SELECT g.*, row_number() OVER (ORDER BY g.ei, g.d, g.o) AS rn FROM (SELECT COALESCE(c.ix, -1) AS ei, CASE WHEN c.ix IS NULL THEN liq.orgao_id END AS o, ${DIA("liq.data")} AS d, SUM(liq.v) AS v, SUM(liq.a) AS a, COUNT(*) AS n, SUM(CASE WHEN liq.a > 0 THEN 1 ELSE 0 END) AS na FROM liq LEFT JOIN canon c ON c.numero = liq.numero_empenho GROUP BY 1, 2, 3) g)`,
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
      `pg AS MATERIALIZED (SELECT g.*, row_number() OVER (ORDER BY g.ei, g.d, g.o) AS rn FROM (SELECT COALESCE(c.ix, -1) AS ei, CASE WHEN c.ix IS NULL THEN pag.orgao_id END AS o, ${DIA("pag.data")} AS d,
        SUM(CASE WHEN pag.anulado = 0 THEN pag.v ELSE 0 END) AS v, SUM(CASE WHEN pag.anulado = 0 THEN pag.rt ELSE 0 END) AS rt,
        SUM(CASE WHEN pag.anulado = 0 THEN pag.lq ELSE 0 END) AS lq, SUM(CASE WHEN pag.anulado = 0 THEN 0 ELSE pag.v END) AS an,
        SUM(CASE WHEN pag.anulado = 0 THEN 1 ELSE 0 END) AS n, SUM(CASE WHEN pag.anulado = 0 THEN 0 ELSE 1 END) AS na
        FROM pag LEFT JOIN canon c ON c.numero = pag.numero_empenho GROUP BY 1, 2, 3) g)`,
    );
  // O dicionário de cada dimensão (os valores distintos, numerados em ordem).
  partes.push(
    ", ",
    DIMS_DICIONARIO.map((d, k) => `d${k} AS MATERIALIZED (SELECT v, row_number() OVER (ORDER BY v) - 1 AS i FROM (SELECT DISTINCT ${COLUNA[d]} AS v FROM emp))`).join(", "),
    " ",
  );
  return juntar(partes);
}

/**
 * A VERSÃO dos dados da Execução: a última importação promovida de QUALQUER card + a última mudança de vínculos + os
 * cards (criar/excluir um card leva ou tira dados sem lote novo).
 */
export const VERSAO_SQL = `((SELECT COUNT(*) || '.' || IFNULL(MAX(l.id), 0) FROM centi_lotes l WHERE ${loteMudou("l")}) || ':' || (SELECT IFNULL(MAX(vinculos_em), '') FROM empenho_cards) || ':' || (SELECT COUNT(*) || '.' || IFNULL(MAX(id), 0) FROM empenho_cards))`;

export async function consultaVersaoExecucao(db: Db): Promise<string> {
  const [r] = await db.all<{ ver: string }>(sql.raw(`SELECT ${VERSAO_SQL} AS ver`));
  return String(r?.ver ?? "");
}

/** A versão de cada TIPO (empenhos ≠ liquidações ≠ pagamentos) + a do cadastro (nomes de órgãos/unidades): cada tela da
 * execução só pede de novo quando o que ELA mostra mudou — importar pagamentos não renova os empenhos. */
export type VersoesExecucao = { empenhos: string; liquidacoes: string; pagamentos: string; cadastro: string };

function versaoTipoSql(t: "empenhos" | "liquidacoes" | "pagamentos"): string {
  return `((SELECT COUNT(*) || '.' || IFNULL(MAX(l.id), 0) FROM centi_lotes l JOIN empenho_cards c ON c.id = l.card_id WHERE c.tipo = '${t}' AND ${loteMudou("l")}) || ':' || (SELECT COUNT(*) || '.' || IFNULL(MAX(id), 0) || '.' || IFNULL(MAX(vinculos_em), '') FROM empenho_cards WHERE tipo = '${t}'))`;
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

/**
 * O PACOTE INTEIRO numa consulta só: as CTEs (as funções de janela sobre empenhos, liquidações e pagamentos) são
 * calculadas UMA vez (`MATERIALIZED`) e cada pedaço sai como uma LINHA (`t` c = a cabeça · e = empenhos · l = liquidações ·
 * p = pagamentos; `k` = o pedaço). Antes, a cabeça e cada pedaço eram consultas separadas que refaziam tudo — o D1
 * respondia "overloaded" (recursos demais em 10 s). Uma consulta = os dados de uma versão só.
 */
export function sqlPacote(anos: readonly number[], escopo: EscopoEmpenhos, f: FontesSql, tam: TamanhoPedacos): SQL {
  const dic = DIMS_DICIONARIO.map((d, k) => `'${d}', (SELECT json_group_array(json_array(i, v)) FROM d${k})`).join(", ");
  const orgaosDe = ["SELECT orgao_id FROM emp", ...(f.liquidacoes ? ["SELECT o FROM lg"] : []), ...(f.pagamentos ? ["SELECT o FROM pg"] : [])].join(" UNION ");
  const tuplaEmp = ["e.id", "e.numero", "e.r", "e.orgao_id", DIA("e.data"), ...DIMS_DICIONARIO.map((_, k) => `d${k}.i`), "e.vb", "e.va", "e.vl", "e.vp", "e.vs"].join(", ");
  const juncoes = DIMS_DICIONARIO.map((d, k) => `LEFT JOIN d${k} ON d${k}.v IS e.${COLUNA[d]}`).join(" ");
  const eventos = (t: "l" | "p", cte: "lg" | "pg", tupla: string) =>
    ` UNION ALL SELECT '${t}' AS t, q.k AS k, (SELECT json_group_array(json_array(${tupla})) FROM (SELECT * FROM ${cte} WHERE (rn - 1) / ${tam.eventos} = q.k ORDER BY rn) g) AS j, NULL AS o, NULL AS ver FROM (SELECT DISTINCT (rn - 1) / ${tam.eventos} AS k FROM ${cte}) q`;
  return juntar([
    ctes(anos, escopo, f),
    `SELECT 'c' AS t, 0 AS k, json_object(${dic}) AS j, (SELECT json_group_array(json_array(o.id, COALESCE(NULLIF(o.sigla, ''), o.nome), o.nome)) FROM orgaos o WHERE o.id IN (${orgaosDe})) AS o, ${VERSAO_SQL} AS ver`,
    ` UNION ALL SELECT 'e' AS t, q.k AS k, (SELECT json_group_array(json_array(${tuplaEmp})) FROM (SELECT * FROM emp WHERE ix / ${tam.emp} = q.k ORDER BY ix) e ${juncoes}) AS j, NULL AS o, NULL AS ver FROM (SELECT DISTINCT ix / ${tam.emp} AS k FROM emp) q`,
    f.liquidacoes ? eventos("l", "lg", "g.ei, g.o, g.d, g.v, g.a, g.n, g.na") : "",
    f.pagamentos ? eventos("p", "pg", "g.ei, g.o, g.d, g.v, g.rt, g.lq, g.an, g.n, g.na") : "",
    " ORDER BY t, k",
  ]);
}

/** Os pedaços de um tipo, na ordem, costurados num só array JSON (sem os colchetes). */
const corpo = (linhas: { t: string; j: string | null }[], t: string) =>
  linhas
    .filter((x) => x.t === t)
    .map((x) => (x.j ?? "[]").slice(1, -1))
    .filter((x) => x.length > 0)
    .join(",");

/**
 * O PACOTE da Execução como TEXTO JSON (`PacoteExec`), numa consulta só. `extra` = os campos já serializados que vão
 * junto (anos, fontes, meta). Resultado GRANDE DEMAIS: de novo UMA vez com os pedaços pela metade (continua uma consulta).
 * A SOBRECARGA do D1 nunca repete aqui (repetir só piora) — sobe para quem chamou servir o último pacote bom.
 */
export async function textoPacoteExecucao(
  db: Db,
  anos: readonly number[],
  escopo: EscopoEmpenhos,
  f: FontesSql,
  extra = "",
  tam: TamanhoPedacos = PEDACOS_PADRAO,
): Promise<string> {
  if (escopoVazio(escopo) || !anos.length) return `{"v":"","dic":{},"orgaos":[],"emp":[],"liq":[],"pag":[]${extra}}`;
  let linhas: { t: string; k: number; j: string | null; o: string | null; ver: string | null }[];
  try {
    linhas = await db.all(sqlPacote(anos, escopo, f, tam));
  } catch (e) {
    if (!erroDeTamanho(e)) throw e;
    console.warn(`[execucao] resultado grande demais (${motivoDoErro(e)}) — pedaços pela metade`);
    linhas = await db.all(sqlPacote(anos, escopo, f, { emp: Math.max(1, Math.floor(tam.emp / 2)), eventos: Math.max(1, Math.floor(tam.eventos / 2)) }));
  }
  const c = linhas.find((x) => x.t === "c");
  return `{"v":${JSON.stringify(String(c?.ver ?? ""))},"dic":${c?.j ?? "{}"},"orgaos":${c?.o ?? "[]"},"emp":[${corpo(linhas, "e")}],"liq":[${corpo(linhas, "l")}],"pag":[${corpo(linhas, "p")}]${extra}}`;
}

/**
 * O motivo REAL de uma falha do banco: o Drizzle embrulha o erro do D1 em "Failed query: <SQL>" e guarda o original em
 * `cause` — devolve a mensagem mais interna, nunca o SQL.
 */
export function motivoDoErro(e: unknown): string {
  let atual: unknown = e;
  let msg = "";
  for (let n = 0; atual instanceof Error && n < 5; n++) {
    if (atual.message && !atual.message.startsWith("Failed query")) msg = atual.message;
    atual = atual.cause;
  }
  if (!msg && typeof atual === "string") msg = atual;
  return (msg || "erro do banco de dados").slice(0, 300);
}

/** Resultado GRANDE DEMAIS para o D1 (um pedaço acima do limite de tamanho). */
export const erroDeTamanho = (e: unknown): boolean => /too ?big|toobig|memory/i.test(motivoDoErro(e));
/** O D1 SOBRECARREGADO (recursos demais na janela, tempo esgotado, objeto reiniciado) — repetir na hora só piora. */
export const erroDeSobrecarga = (e: unknown): boolean => /overloaded|timeout|timed out|exceeded|reset/i.test(motivoDoErro(e));

// ── O PACOTE PRONTO (migração `0179`) ────────────────────────────────────────────────────────────────────────────────
/** Caracteres por parte guardada: 2 bytes por caractere no pior caso = 1,4 MB, abaixo dos 2 MB por linha do D1. */
export const MAX_CHARS_PARTE = 700_000;

/** O texto em partes de até `max` caracteres, sem partir um par substituto (emoji, símbolo fora do plano básico). */
export function partesDoTexto(texto: string, max = MAX_CHARS_PARTE): string[] {
  const r: string[] = [];
  let i = 0;
  while (i < texto.length) {
    let fim = Math.min(texto.length, i + max);
    const c = texto.charCodeAt(fim - 1);
    if (fim < texto.length && c >= 0xd800 && c <= 0xdbff) fim--;
    r.push(texto.slice(i, fim));
    i = fim;
  }
  return r.length ? r : [""];
}

/** O pacote guardado de uma chave: `texto` só quando TODAS as partes da mesma versão estão lá (senão `null`). */
export type PacoteGuardado = { versao: string; texto: string | null; usadoEm: string | null; montandoAte: string | null };

export async function consultaPacoteGuardado(db: Db, chave: string): Promise<PacoteGuardado | null> {
  const linhas = await db
    .select({
      parte: execucaoPacotes.parte,
      versao: execucaoPacotes.versao,
      partes: execucaoPacotes.partes,
      texto: execucaoPacotes.texto,
      usadoEm: execucaoPacotes.usadoEm,
      montandoAte: execucaoPacotes.montandoAte,
    })
    .from(execucaoPacotes)
    .where(eq(execucaoPacotes.chave, chave))
    .orderBy(asc(execucaoPacotes.parte));
  const p0 = linhas[0];
  if (p0?.parte !== 0) return null;
  const completo = p0.partes > 0 && linhas.length === p0.partes && linhas.every((l, i) => l.parte === i && l.versao === p0.versao);
  return { versao: p0.versao, texto: completo ? linhas.map((l) => l.texto).join("") : null, usadoEm: p0.usadoEm, montandoAte: p0.montandoAte };
}

/** A TRAVA da montagem (compare-and-set na parte 0): devolve a linha só quando ESTA execução a conseguiu — livre ou vencida. */
export function comandoTravarMontagem(db: Db, chave: string, pedido: string, agoraIso: string, ateIso: string) {
  return db
    .insert(execucaoPacotes)
    .values({ chave, parte: 0, versao: "", partes: 0, texto: "", pedido, em: agoraIso, usadoEm: agoraIso, montandoAte: ateIso })
    .onConflictDoUpdate({
      target: [execucaoPacotes.chave, execucaoPacotes.parte],
      set: { montandoAte: sql`excluded.montando_ate`, pedido: sql`excluded.pedido` },
      setWhere: or(isNull(execucaoPacotes.montandoAte), lt(execucaoPacotes.montandoAte, agoraIso)),
    })
    .returning({ chave: execucaoPacotes.chave });
}

/** Solta a trava (a montagem falhou): o pacote anterior segue guardado. */
export const comandoSoltarMontagem = (db: Db, chave: string) =>
  db
    .update(execucaoPacotes)
    .set({ montandoAte: null })
    .where(and(eq(execucaoPacotes.chave, chave), eq(execucaoPacotes.parte, 0)));

/** GUARDA o pacote montado (num lote — transação): as partes antigas saem, as novas entram, a trava fica livre. */
export function comandosGuardarPacote(db: Db, chave: string, versao: string, texto: string, pedido: string, agoraIso: string) {
  const partes = partesDoTexto(texto);
  return [
    db.delete(execucaoPacotes).where(eq(execucaoPacotes.chave, chave)),
    // Uma linha por comando: cada parte tem até ~1,4 MB.
    ...partes.map((t, parte) =>
      db.insert(execucaoPacotes).values({
        chave,
        parte,
        versao,
        partes: partes.length,
        texto: t,
        pedido: parte === 0 ? pedido : null,
        em: agoraIso,
        usadoEm: parte === 0 ? agoraIso : null,
        montandoAte: null,
      }),
    ),
  ];
}

/** Renova o ÚLTIMO USO (a pré-montagem só remonta o que alguém abriu nas últimas 24 h) — no máximo a cada `antesIso`. */
export const comandoUsoPacote = (db: Db, chave: string, agoraIso: string, antesIso: string) =>
  db
    .update(execucaoPacotes)
    .set({ usadoEm: agoraIso })
    .where(and(eq(execucaoPacotes.chave, chave), eq(execucaoPacotes.parte, 0), or(isNull(execucaoPacotes.usadoEm), lt(execucaoPacotes.usadoEm, antesIso))));

/** As chaves abertas desde `desdeIso` (com o pedido que as remonta). */
export const consultaPacotesEmUso = (db: Db, desdeIso: string) =>
  db
    .select({ chave: execucaoPacotes.chave, versao: execucaoPacotes.versao, pedido: execucaoPacotes.pedido })
    .from(execucaoPacotes)
    .where(and(eq(execucaoPacotes.parte, 0), isNotNull(execucaoPacotes.pedido), gte(execucaoPacotes.usadoEm, desdeIso)))
    .orderBy(sql`${execucaoPacotes.usadoEm} DESC`);

/** Uma montagem está em andamento agora (a importação automática cede a vez). */
export const consultaMontagemEmCurso = (db: Db, agoraIso: string) =>
  db
    .select({ chave: execucaoPacotes.chave })
    .from(execucaoPacotes)
    .where(and(eq(execucaoPacotes.parte, 0), gte(execucaoPacotes.montandoAte, agoraIso)))
    .limit(1);

/** Os pacotes sem uso desde `antesIso` saem (todas as partes; nunca o que está sendo montado). */
export const comandoLimparPacotes = (db: Db, antesIso: string, agoraIso: string) =>
  db.delete(execucaoPacotes).where(
    inArray(
      execucaoPacotes.chave,
      db
        .select({ c: execucaoPacotes.chave })
        .from(execucaoPacotes)
        .where(
          and(
            eq(execucaoPacotes.parte, 0),
            or(isNull(execucaoPacotes.usadoEm), lt(execucaoPacotes.usadoEm, antesIso)),
            or(isNull(execucaoPacotes.montandoAte), lt(execucaoPacotes.montandoAte, agoraIso)),
          ),
        ),
    ),
  );

/** O que remonta um pacote sem a pessoa (guardado na parte 0): os anos, as etapas e o escopo. */
export type PedidoPacote = { anos: number[]; fontes: FontesSql; escopo: EscopoEmpenhos };

/** O pedido guardado → válido, ou `null` (outro formato: a chave só volta a ser montada quando alguém abrir). */
export function lerPedidoPacote(texto: string | null): PedidoPacote | null {
  try {
    const o = JSON.parse(texto ?? "") as Partial<PedidoPacote>;
    const ints = (l: unknown) => Array.isArray(l) && l.every((x) => Number.isInteger(x));
    if (!ints(o.anos) || !o.fontes || typeof o.fontes.liquidacoes !== "boolean" || typeof o.fontes.pagamentos !== "boolean") return null;
    const e = o.escopo;
    if (e !== null && !(e && ints(e.unidades) && ints(e.orgaos))) return null;
    return { anos: o.anos as number[], fontes: { liquidacoes: o.fontes.liquidacoes, pagamentos: o.fontes.pagamentos }, escopo: e ?? null };
  } catch {
    return null;
  }
}

/** Outra execução está montando a versão nova: serve o pacote ANTERIOR guardado (nunca dois montando juntos). */
export class PacoteEmMontagem extends Error {
  readonly anterior: string;
  constructor(anterior: string) {
    super("O pacote da Execução está sendo montado por outra execução.");
    this.anterior = anterior;
  }
}

/** Quanto tempo a trava da montagem vale (uma montagem leva poucos segundos; a vencida é retomada por outra execução). */
export const TRAVA_MONTAGEM_MS = 60_000;
/** O último uso é regravado no máximo a cada 10 min (poucas escritas). */
const USO_RENOVAR_MS = 10 * 60_000;

/**
 * O PACOTE PRONTO da chave na versão: o GUARDADO (uma leitura barata, sem a CTE) quando é desta versão; senão a montagem
 * com TRAVA (uma execução por chave — monta, guarda e solta). Travado por outra: o guardado anterior (`PacoteEmMontagem`)
 * ou, sem nenhum, monta sem guardar. A sobrecarga do D1 na montagem, com o anterior guardado, também o serve.
 */
export async function pacotePronto(db: Db, chave: string, versao: string, pedido: PedidoPacote, extra: string, agora = new Date()): Promise<string> {
  const g = await consultaPacoteGuardado(db, chave);
  const agoraIso = agora.toISOString();
  if (g?.texto != null && g.versao === versao) {
    const antes = new Date(agora.getTime() - USO_RENOVAR_MS).toISOString();
    if (!g.usadoEm || g.usadoEm < antes) await db.batch([comandoUsoPacote(db, chave, agoraIso, antes)]).catch(() => undefined);
    return g.texto;
  }
  const pedidoJson = JSON.stringify(pedido);
  const travou = await comandoTravarMontagem(db, chave, pedidoJson, agoraIso, new Date(agora.getTime() + TRAVA_MONTAGEM_MS).toISOString());
  if (!travou.length) {
    if (g?.texto) throw new PacoteEmMontagem(g.texto);
    return textoPacoteExecucao(db, pedido.anos, pedido.escopo, pedido.fontes, extra);
  }
  let texto: string;
  try {
    texto = await textoPacoteExecucao(db, pedido.anos, pedido.escopo, pedido.fontes, extra);
  } catch (e) {
    await db.batch([comandoSoltarMontagem(db, chave)]).catch(() => undefined);
    if (g?.texto && erroDeSobrecarga(e)) throw Object.assign(new PacoteEmMontagem(g.texto), { cause: e });
    throw e;
  }
  // Guardar nunca derruba a resposta: falhou, a trava sai e a próxima execução tenta de novo.
  await db.batch(comandosGuardarPacote(db, chave, versao, texto, pedidoJson, agoraIso) as never).catch(async (e) => {
    console.error(`[execucao] não foi possível guardar o pacote: ${motivoDoErro(e)}`);
    await db.batch([comandoSoltarMontagem(db, chave)]).catch(() => undefined);
  });
  return texto;
}
