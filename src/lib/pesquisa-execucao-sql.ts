import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { EscopoEmpenhos } from "./empenhos-tela-core.ts";
import { doEscopo } from "./empenhos-tela-sql.ts";
import { MAX_INDICE_EXECUCAO, type TipoExecucaoPesquisa } from "./pesquisa-core.ts";

// biome-ignore lint/suspicious/noExplicitAny: o schema do Drizzle não importa aqui (o mesmo banco de `getDb`).
type Db = DrizzleD1Database<any>;

/** Linhas por pedaço do JSON (cada texto bem abaixo do teto de 2 MB por valor do D1). */
export const TUPLAS_POR_PEDACO = 4000;

/** As colunas da tupla de cada tipo (só nomes fixos daqui — nunca texto de fora). */
const TUPLA: Record<TipoExecucaoPesquisa, { tabela: string; colunas: string }> = {
  empenho: { tabela: "empenhos", colunas: "id, ano, numero, fornecedor, cpf_cnpj, valor_empenhado, data" },
  liquidacao: { tabela: "liquidacoes", colunas: "id, ano, numero, numero_empenho, credor, cpf_cnpj, valor, data" },
  pagamento: { tabela: "pagamentos", colunas: "id, ano, chave, numero_empenho, credor, cpf_cnpj, valor, data" },
};

/**
 * O ÍNDICE DE TEXTO da pesquisa para empenhos, liquidações ou pagamentos: os vigentes no escopo, o MESMO registro em dois
 * cards UMA vez (o do card de menor id — a régua da tabela única), do mais recente ao mais antigo, até
 * `MAX_INDICE_EXECUCAO`. UMA leitura da tabela (a janela), em pedaços de JSON prontos no banco — o Worker só os junta.
 * Lê a tabela inteira: quem chama guarda na memória por horas (a cota diária de leituras do D1).
 */
export async function consultaIndiceExecucao(db: Db, tipo: TipoExecucaoPesquisa, escopo: EscopoEmpenhos): Promise<{ texto: string; total: number }> {
  const { tabela, colunas } = TUPLA[tipo];
  const lista = colunas
    .split(", ")
    .map((c) => `x.${c}`)
    .join(", ");
  const rows = await db.all<{ j: string; n: number }>(sql.join(
    [
      sql.raw(
        `SELECT json_group_array(json_array(${lista})) AS j, COUNT(*) AS n FROM (SELECT * FROM (SELECT *, row_number() OVER (ORDER BY ano DESC, data DESC, id DESC) AS ord FROM (SELECT t.*, row_number() OVER (PARTITION BY t.chave ORDER BY t.card_id) AS rk FROM ${tabela} t WHERE t.removido_em IS NULL AND `,
      ),
      doEscopo(escopo, "t."),
      sql.raw(`) WHERE rk = 1) WHERE ord <= ${MAX_INDICE_EXECUCAO} ORDER BY ord) x GROUP BY (x.ord - 1) / ${TUPLAS_POR_PEDACO} ORDER BY (x.ord - 1) / ${TUPLAS_POR_PEDACO}`),
    ],
    sql.raw(""),
  ));
  const partes = rows.map((r) => r.j.slice(1, -1)).filter(Boolean);
  return { texto: `[${partes.join(",")}]`, total: rows.reduce((s, r) => s + Number(r.n), 0) };
}
