import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { EscopoEmpenhos } from "./empenhos-tela-core.ts";
import { doEscopo } from "./empenhos-tela-sql.ts";

/**
 * A TABELA de LIQUIDAÇÕES de um card (D1; o banco vem de quem chama — testável no SQLite real, `tests/liquidacoes.test.ts`). O escopo da pessoa é o do EMPENHO (o vínculo da liquidação). As linhas saem
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
  "orgao",
  "unidade",
  "removido",
] as const;

const recorte = (card: number, ano: number, removidos: boolean, escopo: EscopoEmpenhos) =>
  sql.join(
    [
      sql`l.card_id = ${card} AND l.ano = ${ano} AND l.removido_em IS ${removidos ? sql`NOT NULL` : sql`NULL`}`,
      ...(escopo === null ? [] : [sql.raw(" AND "), doEscopo(escopo, "e.")]),
    ],
    sql.raw(""),
  );

/** Os anos com liquidações gravadas no card (no escopo), com quantas. */
// biome-ignore lint/suspicious/noExplicitAny: o schema não importa aqui (o mesmo banco de `getDb`).
type Db = DrizzleD1Database<any>;

export async function anosLiquidacoes(card: number, escopo: EscopoEmpenhos, db: Db): Promise<{ ano: number; n: number }[]> {
  const so = escopo === null ? sql`` : sql.join([sql.raw(" AND "), doEscopo(escopo, "e.")], sql.raw(""));
  return db.all<{ ano: number; n: number }>(
    sql`SELECT l.ano AS ano, COUNT(*) AS n FROM liquidacoes l JOIN empenhos e ON e.id = l.empenho_id WHERE l.card_id = ${card} AND l.removido_em IS NULL${so} GROUP BY l.ano ORDER BY l.ano DESC`,
  );
}

/** As liquidações do ano como o TEXTO de um array JSON de tuplas (`COLUNAS_LIQUIDACAO`). */
export async function textoLiquidacoes(card: number, ano: number, removidos: boolean, escopo: EscopoEmpenhos, db: Db): Promise<string> {
  const onde = recorte(card, ano, removidos, escopo);
  const [{ n }] = await db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM liquidacoes l JOIN empenhos e ON e.id = l.empenho_id WHERE ${onde}`);
  const pedacos = await Promise.all(
    Array.from({ length: Math.ceil(n / POR_PEDACO) }, (_, i) =>
      db.all<{ t: string | null }>(sql`SELECT json_group_array(json_array(l.id, l.data, l.numero, l.numero_empenho, l.credor, l.cpf_cnpj, l.historico, l.valor, l.valor_anulado, l.valor_liquido, l.valor_pago, l.saldo, l.orgao,
        COALESCE((SELECT r.codigo FROM reparticoes r WHERE r.id = e.reparticao_id), (SELECT o.sigla FROM orgaos o WHERE o.id = e.orgao_id)),
        CASE WHEN l.removido_em IS NULL THEN 0 ELSE 1 END)) AS t
        FROM (SELECT l.id AS lid FROM liquidacoes l JOIN empenhos e ON e.id = l.empenho_id WHERE ${onde} ORDER BY l.data DESC, l.id DESC LIMIT ${POR_PEDACO} OFFSET ${i * POR_PEDACO}) x
        JOIN liquidacoes l ON l.id = x.lid JOIN empenhos e ON e.id = l.empenho_id`),
    ),
  );
  const partes = pedacos.map((p) => (p[0]?.t ?? "[]").slice(1, -1)).filter(Boolean);
  return `[${partes.join(",")}]`;
}
