import { and, eq, gt, lte, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { dfdItens, dfdProtocolos, dfds } from "../db/schema.ts";

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
 * Os GRUPOS de assinatura de um DFD (Centi/Dropsigner/Adobe/Foxit/Equipe) lidos NO BANCO — a lista da Mesa não traz o
 * JSON INTEIRO das assinaturas (peso: nome, CPF, código, URL, validação… de cada uma) só para saber os formatos. Devolve
 * um array JSON (texto) com os grupos distintos; `gruposDoTexto` (dfd-tratamento) os põe na ordem fixa. A MESMA régua de
 * `gruposAssinatura(parseAssinaturas(json))`: JSON inválido ou que não é array = nenhum; só as entradas objeto/array
 * contam (o `typeof === "object"` do JS); a `fonte` fora das conhecidas (ou ausente) = Centi. Os `CASE` aninhados garantem
 * que `json_type`/`json_extract` só rodam sobre JSON válido e sobre elementos objeto/array (o `AND` do SQLite não promete
 * a ordem). Builder sem getDb (testado pelo driver D1 real). Puro.
 */
export const gruposAssinaturaSql = sql<string | null>`(SELECT json_group_array(DISTINCT CASE WHEN a.type IN ('object', 'array') THEN CASE json_extract(a.value, '$.fonte') WHEN 'dropsigner' THEN 'dropsigner' WHEN 'adobe' THEN 'adobe' WHEN 'foxit' THEN 'foxit' WHEN 'manual' THEN 'manual' ELSE 'centi' END END) FROM json_each(CASE WHEN json_valid(${dfds.assinaturas}) THEN CASE WHEN json_type(${dfds.assinaturas}) = 'array' THEN ${dfds.assinaturas} ELSE '[]' END ELSE '[]' END) AS a WHERE a.type IN ('object', 'array'))`;

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

/**
 * TOTAIS do DFD = os ITENS gravados (a regra única do sistema): `total_itens` = quantos itens existem e `valor_total` = a soma
 * dos totais dos itens arredondada ao centavo (NULL quando ≤ 0 — nunca estimado). O UPDATE vai no MESMO `db.batch` da escrita
 * dos itens (atômico). `soCompleto` (importação em lotes): só recalcula quando a contagem já alcançou o total DECLARADO no
 * `start-dfd` — a importação pela metade mantém o declarado (o desfazer e a sincronia do PCA o usam; a conferência o acusa).
 * Builder sem getDb (testado pelo driver D1 real).
 */
export function comandoTotaisDfd(db: DrizzleD1Database<typeof schema>, alvo: number | SQL, { soCompleto = false }: { soCompleto?: boolean } = {}) {
  const contagem = sql`(SELECT COUNT(*) FROM ${dfdItens} WHERE ${dfdItens.dfdId} = ${dfds.id})`;
  const soma = sql`SUM(COALESCE(${dfdItens.valorTotal}, 0))`;
  return db
    .update(dfds)
    .set({
      totalItens: contagem,
      valorTotal: sql`(SELECT CASE WHEN ${soma} > 0 THEN ROUND(${soma}, 2) END FROM ${dfdItens} WHERE ${dfdItens.dfdId} = ${dfds.id})`,
      atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(and(eq(dfds.id, alvo), soCompleto ? sql`${contagem} >= COALESCE(${dfds.totalItens}, 0)` : undefined));
}

/** Apaga os itens do DFD na FAIXA de um lote (`de < sequencial ≤ ate`) — o append regrava só o próprio lote: o retry do mesmo
 * lote não duplica e um retry ATRASADO nunca apaga um lote posterior. Builder (testado pelo driver D1 real). */
export function comandoApagarFaixaItens(db: DrizzleD1Database<typeof schema>, dfdId: number, de: number, ate: number) {
  return db.delete(dfdItens).where(and(eq(dfdItens.dfdId, dfdId), gt(dfdItens.sequencial, de), lte(dfdItens.sequencial, ate)));
}
