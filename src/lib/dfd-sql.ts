import { type SQL, sql } from "drizzle-orm";
import { dfdProtocolos, dfds } from "../db/schema.ts";

/**
 * Texto da seção PRIORIDADE do DFD lido NO BANCO — só essa seção sai do JSON `secoes` (a lista da Mesa não traz as
 * seções inteiras: a justificativa pesa). Casa o título pela palavra-chave, como `SECOES_OBRIGATORIAS` (o nº da seção
 * varia entre modelos). JSON inválido/ausente ⇒ nenhuma seção (nunca derruba a consulta). O cliente normaliza com
 * `normPrioridade`. Builder sem getDb (testado pelo driver D1 real). Puro.
 */
export const prioridadeTextoSql = sql<string | null>`(SELECT json_extract(s.value, '$.texto') FROM json_each(CASE WHEN json_valid(${dfds.secoes}) THEN ${dfds.secoes} ELSE '[]' END) AS s WHERE json_extract(s.value, '$.titulo') LIKE '%PRIORIDADE%' LIMIT 1)`;

/**
 * O PCA (ano) de um DFD na Mesa: o do PROTOCOLO de origem — "no protocolo, todos seguem o do protocolo" — e, sem
 * protocolo (ou protocolo antigo sem ano), o do próprio DFD.
 */
export const anoPcaDfdSql = sql<number | null>`COALESCE(${dfdProtocolos.anoPca}, ${dfds.anoPca})`;

/** Filtro do PCA do cabeçalho sobre DFDs/itens (a consulta junta `dfd_protocolos`); `null` = todos os PCAs. */
export function filtroAnoPcaDfd(ano: number | null | undefined): SQL | undefined {
  return ano == null ? undefined : sql`${anoPcaDfdSql} = ${ano}`;
}
