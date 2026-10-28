import { sql } from "drizzle-orm";
import { type AlteracaoCenti, alteracoesDoRegistro } from "./centi-alteracoes-core.ts";
import { consultaAlteracoes } from "./centi-alteracoes-sql.ts";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { EscopoEmpenhos } from "./empenhos-tela-core.ts";
import { doEscopo } from "./empenhos-tela-sql.ts";

/**
 * A TABELA de LIQUIDAÇÕES de um card (D1; o banco vem de quem chama — testável no SQLite real, `tests/liquidacoes.test.ts`).
 * O escopo da pessoa é o da PRÓPRIA liquidação (o órgão e a unidade do cadastro = os do EMPENHO de mesmo número). As linhas saem
 * do banco já como TEXTO JSON (tuplas, em pedaços de `POR_PEDACO`) — o Worker só junta os pedaços, sem ler cada linha.
 */
const POR_PEDACO = 2500;

/** A ordem das colunas das tuplas (a tela lê pela mesma lista). */
export const COLUNAS_LIQUIDACAO = [
  "id",
  "data",
  "numero",
  "numeroEmpenho",
  "credor",
  "cpfCnpj",
  "historico",
  "valor",
  "valorAnulado",
  "valorLiquido",
  "valorPago",
  "saldo",
  "orgaoCenti",
  "orgao",
  "unidade",
  "removido",
  "anoEmpenho",
  "cardId",
] as const;

/**
 * O EMPENHO de uma liquidação, pelo NÚMERO (o número do empenho liga empenhos, liquidações e pagamentos), em TODA a tabela de
 * empenhos — de QUALQUER ano (restos a pagar) e de qualquer card —, com a MESMA régua do destino (`destinoSql`,
 * `liquidacoes-sql.ts`): o ativo, com unidade, o mais antigo.
 */
const empenhoDa = (alias: string, col: string) =>
  sql.raw(
    `(SELECT e.${col} FROM empenhos e WHERE e.numero = ${alias}.numero_empenho AND e.orgao_id IS NOT NULL ORDER BY e.removido_em IS NOT NULL, e.reparticao_id IS NULL, e.id LIMIT 1)`,
  );

/**
 * A UNIDADE na tela = a do EMPENHO ligado pelo número, lida na hora (a mesma régua da coluna Unidade dos empenhos —
 * `UNIDADE_SISTEMA`: o empenho vinculado só ao órgão mostra a sigla do órgão); sem o empenho no sistema, a gravada na linha.
 * `completo` = "SIGLA — Nome" (o banner); senão só a sigla (a tabela). Vale para liquidações e pagamentos.
 */
export const unidadeNaTela = (alias: string, completo = false) => {
  const un = completo ? "r.codigo || ' — ' || r.nome" : "r.codigo";
  const org = completo ? "CASE WHEN COALESCE(o.sigla, '') = '' THEN o.nome ELSE o.sigla || ' — ' || o.nome END" : "COALESCE(NULLIF(o.sigla, ''), o.nome)";
  return sql.raw(
    `COALESCE((SELECT COALESCE((SELECT ${un} FROM reparticoes r WHERE r.id = e.reparticao_id), (SELECT ${org} FROM orgaos o WHERE o.id = e.orgao_id)) FROM empenhos e WHERE e.numero = ${alias}.numero_empenho AND e.orgao_id IS NOT NULL ORDER BY e.removido_em IS NOT NULL, e.reparticao_id IS NULL, e.id LIMIT 1), (SELECT ${un} FROM reparticoes r WHERE r.id = ${alias}.reparticao_id))`,
  );
};

/** O recorte: o card (`null` = TODOS os cards do tipo — o mesmo registro, a chave, em dois cards entra UMA vez: o do card de
 * menor id), o ano, vigentes × removidos e o escopo. */
const recorte = (card: number | null, ano: number, removidos: boolean, escopo: EscopoEmpenhos) =>
  sql.join(
    [
      card === null
        ? sql`l.id IN (SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY chave ORDER BY card_id) AS rk FROM liquidacoes WHERE ano = ${ano} AND removido_em IS ${removidos ? sql`NOT NULL` : sql`NULL`}) WHERE rk = 1)`
        : sql`l.card_id = ${card} AND l.ano = ${ano} AND l.removido_em IS ${removidos ? sql`NOT NULL` : sql`NULL`}`,
      ...(escopo === null ? [] : [sql.raw(" AND "), doEscopo(escopo, "l.")]),
    ],
    sql.raw(""),
  );

/** Os anos com liquidações gravadas no card (no escopo), com quantas. */
// biome-ignore lint/suspicious/noExplicitAny: o schema não importa aqui (o mesmo banco de `getDb`).
type Db = DrizzleD1Database<any>;

export async function anosLiquidacoes(card: number | null, escopo: EscopoEmpenhos, db: Db): Promise<{ ano: number; n: number }[]> {
  const so = escopo === null ? sql`` : sql.join([sql.raw(" AND "), doEscopo(escopo, "l.")], sql.raw(""));
  // `null` = todos os cards do tipo: o mesmo registro (a chave) em dois cards conta UMA vez.
  const de =
    card === null
      ? sql.raw("(SELECT * FROM (SELECT x.*, row_number() OVER (PARTITION BY x.chave ORDER BY x.card_id) AS rk FROM liquidacoes x WHERE x.removido_em IS NULL) WHERE rk = 1) l WHERE 1")
      : sql`liquidacoes l WHERE l.card_id = ${card} AND l.removido_em IS NULL`;
  return db.all<{ ano: number; n: number }>(sql`SELECT l.ano AS ano, COUNT(*) AS n FROM ${de}${so} GROUP BY l.ano ORDER BY l.ano DESC`);
}

/** As liquidações do ano como o TEXTO de um array JSON de tuplas (`COLUNAS_LIQUIDACAO`). */
export async function textoLiquidacoes(card: number | null, ano: number, removidos: boolean, escopo: EscopoEmpenhos, db: Db): Promise<string> {
  const onde = recorte(card, ano, removidos, escopo);
  const [{ n }] = await db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM liquidacoes l WHERE ${onde}`);
  const pedacos = await Promise.all(
    Array.from({ length: Math.ceil(n / POR_PEDACO) }, (_, i) =>
      db.all<{ t: string | null }>(sql`SELECT json_group_array(json_array(l.id, l.data, l.numero, l.numero_empenho, l.credor, l.cpf_cnpj, l.historico, l.valor, l.valor_anulado, l.valor_liquido, l.valor_pago, l.saldo, l.orgao,
        (SELECT COALESCE(NULLIF(o.sigla, ''), o.nome) FROM orgaos o WHERE o.id = l.orgao_id),
        ${unidadeNaTela("l")},
        CASE WHEN l.removido_em IS NULL THEN 0 ELSE 1 END,
        ${empenhoDa("l", "ano")}, l.card_id)) AS t
        FROM (SELECT l.id AS lid FROM liquidacoes l WHERE ${onde} ORDER BY l.data DESC, l.id DESC LIMIT ${POR_PEDACO} OFFSET ${i * POR_PEDACO}) x
        JOIN liquidacoes l ON l.id = x.lid`),
    ),
  );
  const partes = pedacos.map((p) => (p[0]?.t ?? "[]").slice(1, -1)).filter(Boolean);
  return `[${partes.join(",")}]`;
}

/** O empenho ligado a uma liquidação (pelo número), como o banner o mostra. */
export type EmpenhoDaLiquidacao = {
  id: number;
  ano: number;
  numero: string;
  data: string | null;
  orgaoGestor: string;
  unidadeOrcamentaria: string | null;
  fornecedor: string | null;
  acao: string | null;
  elemento: string | null;
  fonte: string | null;
  valorEmpenhado: number;
  valorLiquidado: number;
  valorPago: number;
  saldoPagar: number;
  removidoEm: string | null;
  card: string | null;
};

/** Uma liquidação com TUDO (o registro, o cadastro e o empenho ligado) — o banner da aba Liquidações. */
export type LiquidacaoCompleta = {
  id: number;
  ano: number;
  srcId: number | null;
  numero: string | null;
  data: string | null;
  numeroEmpenho: string;
  orgaoCenti: string;
  idOrgaoCenti: number;
  credor: string | null;
  cpfCnpj: string | null;
  historico: string | null;
  valor: number;
  valorAnulado: number;
  valorLiquido: number;
  valorPago: number;
  saldo: number;
  orgao: string | null;
  unidade: string | null;
  loteId: number | null;
  loteConcluidoEm: string | null;
  leitor: number;
  removidoEm: string | null;
  /** A importação em que a Centi não a trouxe mais (AUSENTE — ainda valendo). */
  ausenteDesdeLote: number | null;
  criadoEm: string;
  atualizadoEm: string;
  empenho: EmpenhoDaLiquidacao | null;
  /** O HISTÓRICO das alterações que a Centi fez (as mais recentes primeiro). */
  alteracoes: AlteracaoCenti[];
};

/** Uma liquidação do card (no escopo da pessoa; fora dele = null, como inexistente) com o empenho ligado pelo número. */
export async function liquidacaoCompleta(card: number, id: number, escopo: EscopoEmpenhos, db: Db): Promise<LiquidacaoCompleta | null> {
  const so = escopo === null ? sql`` : sql.join([sql.raw(" AND "), doEscopo(escopo, "l.")], sql.raw(""));
  const [l] = await db.all<Omit<LiquidacaoCompleta, "empenho" | "alteracoes"> & { empenhoId: number | null }>(
    sql`SELECT l.id AS id, l.ano AS ano, l.src_id AS srcId, l.numero AS numero, l.data AS data, l.numero_empenho AS numeroEmpenho,
      l.orgao AS orgaoCenti, l.id_orgao_centi AS idOrgaoCenti, l.credor AS credor, l.cpf_cnpj AS cpfCnpj, l.historico AS historico,
      l.valor AS valor, l.valor_anulado AS valorAnulado, l.valor_liquido AS valorLiquido, l.valor_pago AS valorPago, l.saldo AS saldo,
      (SELECT CASE WHEN COALESCE(o.sigla, '') = '' THEN o.nome ELSE o.sigla || ' — ' || o.nome END FROM orgaos o WHERE o.id = l.orgao_id) AS orgao,
      ${unidadeNaTela("l", true)} AS unidade,
      l.lote_id AS loteId, (SELECT c.concluido_em FROM centi_lotes c WHERE c.id = l.lote_id) AS loteConcluidoEm,
      l.leitor AS leitor, l.removido_em AS removidoEm, l.ausente_desde_lote AS ausenteDesdeLote, l.criado_em AS criadoEm, l.atualizado_em AS atualizadoEm,
      ${empenhoDa("l", "id")} AS empenhoId
      FROM liquidacoes l WHERE l.card_id = ${card} AND l.id = ${id}${so} LIMIT 1`,
  );
  if (!l) return null;
  const { empenhoId, ...liq } = l;
  const [e] =
    empenhoId == null
      ? []
      : await db.all<EmpenhoDaLiquidacao>(
          sql`SELECT e.id AS id, e.ano AS ano, e.numero AS numero, e.data AS data, e.orgao_gestor AS orgaoGestor, e.unidade_orcamentaria AS unidadeOrcamentaria,
            e.fornecedor AS fornecedor, e.acao AS acao, e.elemento AS elemento, e.fonte AS fonte, e.valor_empenhado AS valorEmpenhado,
            e.valor_liquidado AS valorLiquidado, e.valor_pago AS valorPago, e.saldo_pagar AS saldoPagar, e.removido_em AS removidoEm,
            (SELECT c.nome FROM empenho_cards c WHERE c.id = e.card_id) AS card
            FROM empenhos e WHERE e.id = ${empenhoId}`,
        );
  return { ...liq, empenho: e ?? null, alteracoes: alteracoesDoRegistro(await consultaAlteracoes(db, "liquidacao", liq.id)) };
}
