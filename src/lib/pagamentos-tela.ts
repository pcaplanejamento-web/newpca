import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { EscopoEmpenhos } from "./empenhos-tela-core.ts";
import { doEscopo } from "./empenhos-tela-sql.ts";
import { type EmpenhoDaLiquidacao, unidadeNaTela } from "./liquidacoes-tela.ts";

/**
 * A TABELA de PAGAMENTOS de um card (D1; o banco vem de quem chama — testável no SQLite real, `tests/pagamentos.test.ts`) —
 * a MESMA da tabela de liquidações (`liquidacoes-tela.ts`): o escopo é o do PRÓPRIO pagamento (o órgão e a unidade do
 * cadastro = os do EMPENHO de mesmo número); as linhas saem do banco já como TEXTO JSON (tuplas, em pedaços).
 */
const POR_PEDACO = 2500;

/** A ordem das colunas das tuplas (a tela lê pela mesma lista). */
export const COLUNAS_PAGAMENTO = [
  "id",
  "data",
  "numeroEmpenho",
  "credor",
  "cpfCnpj",
  "historico",
  "valor",
  "valorRetencao",
  "valorLiquido",
  "anulado",
  "motivoAnulacao",
  "orgaoCenti",
  "orgao",
  "unidade",
  "removido",
  "anoEmpenho",
] as const;

/** O EMPENHO de um pagamento pelo NÚMERO, em TODA a tabela de empenhos (qualquer ano e card) — a régua de `destinoSql`. */
const empenhoDo = (alias: string, col: string) =>
  sql.raw(
    `(SELECT e.${col} FROM empenhos e WHERE e.numero = ${alias}.numero_empenho AND e.orgao_id IS NOT NULL ORDER BY e.removido_em IS NOT NULL, e.reparticao_id IS NULL, e.id LIMIT 1)`,
  );

const recorte = (card: number, ano: number, removidos: boolean, escopo: EscopoEmpenhos) =>
  sql.join(
    [
      sql`p.card_id = ${card} AND p.ano = ${ano} AND p.removido_em IS ${removidos ? sql`NOT NULL` : sql`NULL`}`,
      ...(escopo === null ? [] : [sql.raw(" AND "), doEscopo(escopo, "p.")]),
    ],
    sql.raw(""),
  );

// biome-ignore lint/suspicious/noExplicitAny: o schema não importa aqui (o mesmo banco de `getDb`).
type Db = DrizzleD1Database<any>;

/** Os anos com pagamentos gravados no card (no escopo), com quantos. */
export async function anosPagamentos(card: number, escopo: EscopoEmpenhos, db: Db): Promise<{ ano: number; n: number }[]> {
  const so = escopo === null ? sql`` : sql.join([sql.raw(" AND "), doEscopo(escopo, "p.")], sql.raw(""));
  return db.all<{ ano: number; n: number }>(
    sql`SELECT p.ano AS ano, COUNT(*) AS n FROM pagamentos p WHERE p.card_id = ${card} AND p.removido_em IS NULL${so} GROUP BY p.ano ORDER BY p.ano DESC`,
  );
}

/** Os pagamentos do ano como o TEXTO de um array JSON de tuplas (`COLUNAS_PAGAMENTO`). */
export async function textoPagamentos(card: number, ano: number, removidos: boolean, escopo: EscopoEmpenhos, db: Db): Promise<string> {
  const onde = recorte(card, ano, removidos, escopo);
  const [{ n }] = await db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM pagamentos p WHERE ${onde}`);
  const pedacos = await Promise.all(
    Array.from({ length: Math.ceil(n / POR_PEDACO) }, (_, i) =>
      db.all<{ t: string | null }>(sql`SELECT json_group_array(json_array(p.id, p.data, p.numero_empenho, p.credor, p.cpf_cnpj, p.historico, p.valor, p.valor_retencao, p.valor_liquido,
        p.anulado, p.motivo_anulacao, p.orgao,
        (SELECT COALESCE(NULLIF(o.sigla, ''), o.nome) FROM orgaos o WHERE o.id = p.orgao_id),
        ${unidadeNaTela("p")},
        CASE WHEN p.removido_em IS NULL THEN 0 ELSE 1 END,
        ${empenhoDo("p", "ano")})) AS t
        FROM (SELECT p.id AS pid FROM pagamentos p WHERE ${onde} ORDER BY p.data DESC, p.id DESC LIMIT ${POR_PEDACO} OFFSET ${i * POR_PEDACO}) x
        JOIN pagamentos p ON p.id = x.pid`),
    ),
  );
  const partes = pedacos.map((q) => (q[0]?.t ?? "[]").slice(1, -1)).filter(Boolean);
  return `[${partes.join(",")}]`;
}

/** Um pagamento com TUDO (o registro, o cadastro e o empenho ligado) — o banner da aba Pagamentos. */
export type PagamentoCompleto = {
  id: number;
  ano: number;
  srcId: number | null;
  data: string | null;
  numeroEmpenho: string;
  orgaoCenti: string;
  idOrgaoCenti: number;
  credor: string | null;
  cpfCnpj: string | null;
  historico: string | null;
  valor: number;
  valorRetencao: number;
  valorLiquido: number;
  anulado: number;
  motivoAnulacao: string | null;
  orgao: string | null;
  unidade: string | null;
  loteId: number | null;
  loteConcluidoEm: string | null;
  leitor: number;
  removidoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
  empenho: EmpenhoDaLiquidacao | null;
};

/** Um pagamento do card (no escopo da pessoa; fora dele = null, como inexistente) com o empenho ligado pelo número. */
export async function pagamentoCompleto(card: number, id: number, escopo: EscopoEmpenhos, db: Db): Promise<PagamentoCompleto | null> {
  const so = escopo === null ? sql`` : sql.join([sql.raw(" AND "), doEscopo(escopo, "p.")], sql.raw(""));
  const [p] = await db.all<Omit<PagamentoCompleto, "empenho"> & { empenhoId: number | null }>(
    sql`SELECT p.id AS id, p.ano AS ano, p.src_id AS srcId, p.data AS data, p.numero_empenho AS numeroEmpenho,
      p.orgao AS orgaoCenti, p.id_orgao_centi AS idOrgaoCenti, p.credor AS credor, p.cpf_cnpj AS cpfCnpj, p.historico AS historico,
      p.valor AS valor, p.valor_retencao AS valorRetencao, p.valor_liquido AS valorLiquido, p.anulado AS anulado, p.motivo_anulacao AS motivoAnulacao,
      (SELECT CASE WHEN COALESCE(o.sigla, '') = '' THEN o.nome ELSE o.sigla || ' — ' || o.nome END FROM orgaos o WHERE o.id = p.orgao_id) AS orgao,
      ${unidadeNaTela("p", true)} AS unidade,
      p.lote_id AS loteId, (SELECT c.concluido_em FROM centi_lotes c WHERE c.id = p.lote_id) AS loteConcluidoEm,
      p.leitor AS leitor, p.removido_em AS removidoEm, p.criado_em AS criadoEm, p.atualizado_em AS atualizadoEm,
      ${empenhoDo("p", "id")} AS empenhoId
      FROM pagamentos p WHERE p.card_id = ${card} AND p.id = ${id}${so} LIMIT 1`,
  );
  if (!p) return null;
  const { empenhoId, ...pag } = p;
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
  return { ...pag, empenho: e ?? null };
}
