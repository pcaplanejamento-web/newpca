import { type SQL, sql } from "drizzle-orm";
import { dfdProtocolos, dfds } from "../db/schema.ts";

/**
 * Texto da seção PRIORIDADE do DFD lido NO BANCO — só essa seção sai do JSON `secoes` (a lista da Mesa não traz as
 * seções inteiras: a justificativa pesa). Casa o título pela palavra-chave, como `SECOES_OBRIGATORIAS` (o nº da seção
 * varia entre modelos). NUNCA derruba a consulta: JSON inválido/ausente ⇒ nenhuma seção, e só os elementos OBJETO são
 * lidos — o `json_extract` sobre um elemento texto ("malformed JSON") falharia a lista INTEIRA (o `CASE` garante a ordem:
 * a condição do `WHERE` pode ser avaliada em qualquer ordem). O texto sai sempre como TEXTO (um número vira "5"). O
 * cliente normaliza com `normPrioridade`. Builder sem getDb (testado pelo driver D1 real). Puro.
 */
export const prioridadeTextoSql = sql<string | null>`(SELECT CAST(json_extract(CASE WHEN s.type = 'object' THEN s.value END, '$.texto') AS TEXT) FROM json_each(CASE WHEN json_valid(${dfds.secoes}) THEN ${dfds.secoes} ELSE '[]' END) AS s WHERE json_extract(CASE WHEN s.type = 'object' THEN s.value END, '$.titulo') LIKE '%PRIORIDADE%' LIMIT 1)`;

/**
 * O PCA (ano) de um DFD na Mesa: o do PROTOCOLO de origem — "no protocolo, todos seguem o do protocolo" — e, sem
 * protocolo (ou protocolo antigo sem ano), o do próprio DFD.
 */
export const anoPcaDfdSql = sql<number | null>`COALESCE(${dfdProtocolos.anoPca}, ${dfds.anoPca})`;

/** Filtro do PCA do cabeçalho sobre DFDs/itens (a consulta junta `dfd_protocolos`); `null` = todos os PCAs. */
export function filtroAnoPcaDfd(ano: number | null | undefined): SQL | undefined {
  return ano == null ? undefined : sql`${anoPcaDfdSql} = ${ano}`;
}

/**
 * Filtro do PCA do cabeçalho sobre PROTOCOLOS — a MESMA régua dos DFDs (`anoPcaDfdSql`): o ano do protocolo; o protocolo
 * ANTIGO sem ano entra quando algum DFD dele é desse PCA (é por ele que o DFD aparece). Assim a lista de protocolos, a de
 * DFDs e a de itens nunca se contradizem. `null` = todos os PCAs.
 */
export function filtroAnoPcaProtocolo(ano: number | null | undefined): SQL | undefined {
  return ano == null
    ? undefined
    : sql`(${dfdProtocolos.anoPca} = ${ano} OR (${dfdProtocolos.anoPca} IS NULL AND EXISTS (SELECT 1 FROM "dfds" AS d WHERE d."protocolo_id" = ${dfdProtocolos.id} AND d."ano_pca" = ${ano})))`;
}
