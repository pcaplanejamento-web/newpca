import { and, eq, inArray, isNotNull, isNull, ne, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { dfdItens, dfds, pcaDfds, pcaItens } from "../db/schema.ts";
import type { AcaoDfdPca } from "./pca-core.ts";

/**
 * SEQUENCIAL do ITEM no PCA — os comandos como BUILDERS do Drizzle (sem getDb: testados pelo driver D1 sobre
 * `node:sqlite`, DENTRO de `db.batch` — `tests/pca-itens-sql.test.ts`). Builders, e não `db.run(sql…)`: no driver
 * D1 um comando cru com parâmetros quebra dentro de `db.batch` (ver `rastro-sql.ts`).
 *
 * - `numerarItensDoProtocolo`: na INCORPORAÇÃO (depois do upsert em `pca_dfds`, no MESMO lote atômico), dá a cada
 *   item dos DFDs do protocolo vinculados a ESTE PCA (ação ≠ excluir) o próximo número ÚNICO do PCA (MAX + ordem
 *   estável DFD → sequencial do item). Idempotente: item já numerado neste PCA não ganha outro. Nunca reaproveita
 *   (o MAX conta também os INATIVOS e os BAIXADOS).
 * - `gravarSequencialNosItens`: o item REGISTRA o número no próprio banco (`dfd_itens.pca_id`/`pca_sequencial`).
 * - PROTOCOLO INCORPORADO EDITÁVEL (migração `0077`): a regravação dos itens guarda o RETRATO antes de apagar
 *   (`retratarNumeros`), as linhas novas levam o nº pareado (`pca-numeracao-core`) e o RELIGAM (`religarNumeros`); no fim
 *   da gravação, os itens novos ganham nº (`numerarItensDoDfd` + `gravarSequencialDoDfd`) e os nºs sem item são BAIXADOS
 *   (`baixarNumerosPendentes`). O DFD entra/sai do PCA com o protocolo incorporado (`vincularDfdAoPca`/
 *   `desvincularDfdDoPca` + `baixarNumeros`).
 */
type Db = DrizzleD1Database<typeof schema>;

/** As colunas do RETRATO e da baixa — no fim do `select` do insert…select (a ordem das colunas da tabela). */
const retratoDoItem = () => ({
  codigo: dfdItens.codigo,
  descricao: dfdItens.descricao,
  unidade: dfdItens.unidade,
  item: dfdItens.item,
  baixadoEm: sql<string | null>`NULL`.as("baixado_em"),
});

export function numerarItensDoProtocolo(db: Db, pcaId: number, protocoloId: number) {
  // As chaves na MESMA ordem das colunas da tabela (exigência do insert…select do Drizzle).
  const numerados = db
    .select({
      id: sql<number>`NULL`.as("id"),
      pcaId: sql<number>`${pcaId}`.as("pca_id"),
      sequencial:
        sql<number>`(SELECT COALESCE(MAX(x.sequencial), 0) FROM pca_itens x WHERE x.pca_id = ${pcaId}) + ROW_NUMBER() OVER (ORDER BY ${dfds.id}, ${dfdItens.sequencial}, ${dfdItens.id})`.as(
          "sequencial",
        ),
      dfdItemId: dfdItens.id,
      dfdId: dfds.id,
      protocoloId: dfds.protocoloId,
      ativo: sql<number>`1`.as("ativo"),
      inativadoEm: sql<string | null>`NULL`.as("inativado_em"),
      inativadoPor: sql<number | null>`NULL`.as("inativado_por"),
      motivo: sql<string | null>`NULL`.as("motivo"),
      criadoEm: sql<string>`CURRENT_TIMESTAMP`.as("criado_em"),
      ...retratoDoItem(),
    })
    .from(dfdItens)
    .innerJoin(dfds, eq(dfds.id, dfdItens.dfdId))
    .innerJoin(pcaDfds, and(eq(pcaDfds.dfdId, dfds.id), eq(pcaDfds.pcaId, pcaId)))
    .where(
      and(
        eq(dfds.protocoloId, protocoloId),
        ne(pcaDfds.acao, "excluir"),
        sql`NOT EXISTS (SELECT 1 FROM pca_itens y WHERE y.pca_id = ${pcaId} AND y.dfd_item_id = ${dfdItens.id})`,
      ),
    );
  return db.insert(pcaItens).select(numerados);
}

export function gravarSequencialNosItens(db: Db, pcaId: number, protocoloId: number) {
  return db
    .update(dfdItens)
    .set({
      pcaId,
      pcaSequencial: sql`(SELECT x.sequencial FROM pca_itens x WHERE x.pca_id = ${pcaId} AND x.dfd_item_id = ${dfdItens.id})`,
    })
    .where(
      inArray(
        dfdItens.id,
        db
          .select({ id: pcaItens.dfdItemId })
          .from(pcaItens)
          .where(and(eq(pcaItens.pcaId, pcaId), eq(pcaItens.protocoloId, protocoloId))),
      ),
    );
}

/** O alvo de uma baixa/retrato: UM DFD ou todos os DFDs de um protocolo. */
export type AlvoNumeros = { dfdId: number } | { protocoloId: number };
const dfdsDoAlvo = (db: Db, alvo: AlvoNumeros): SQL =>
  "dfdId" in alvo ? eq(pcaItens.dfdId, alvo.dfdId) : inArray(pcaItens.dfdId, db.select({ id: dfds.id }).from(dfds).where(eq(dfds.protocoloId, alvo.protocoloId)));

/** O RETRATO do item em cada nº que ainda tem item — ANTES de todo DELETE de itens (o nº que perde o item guarda quem
 * ele era: o pareamento da regravação e o histórico). */
export function retratarNumeros(db: Db, alvo: AlvoNumeros) {
  const doItem = (col: string) => sql`(SELECT i.${sql.raw(col)} FROM dfd_itens i WHERE i.id = ${pcaItens.dfdItemId})`;
  return db
    .update(pcaItens)
    .set({ codigo: doItem("codigo"), descricao: doItem("descricao"), unidade: doItem("unidade"), item: doItem("item") })
    .where(and(dfdsDoAlvo(db, alvo), isNotNull(pcaItens.dfdItemId)));
}

/** RELIGA os nºs livres do DFD às linhas novas que os carregam (`dfd_itens.pca_id`/`pca_sequencial` vindos do pareamento)
 * — UM comando, qualquer que seja o tamanho do DFD. */
export function religarNumeros(db: Db, dfdId: number) {
  const linha = sql`(SELECT i.id FROM dfd_itens i WHERE i.dfd_id = ${dfdId} AND i.pca_id = ${pcaItens.pcaId} AND i.pca_sequencial = ${pcaItens.sequencial} ORDER BY i.id LIMIT 1)`;
  return db
    .update(pcaItens)
    .set({ dfdItemId: linha })
    .where(and(eq(pcaItens.dfdId, dfdId), isNull(pcaItens.dfdItemId), isNull(pcaItens.baixadoEm), sql`EXISTS ${linha}`));
}

/**
 * NUMERA os itens do DFD ainda sem nº no PCA em que ele entrou por um protocolo INCORPORADO (vínculo com `protocolo_id`,
 * ação ≠ excluir) — o MESMO MAX + ROW_NUMBER da incorporação, na ordem do DFD, com o retrato. Idempotente.
 */
export function numerarItensDoDfd(db: Db, dfdId: number) {
  const numerados = db
    .select({
      id: sql<number>`NULL`.as("id"),
      pcaId: pcaDfds.pcaId,
      sequencial:
        sql<number>`(SELECT COALESCE(MAX(x.sequencial), 0) FROM pca_itens x WHERE x.pca_id = ${pcaDfds.pcaId}) + ROW_NUMBER() OVER (PARTITION BY ${pcaDfds.pcaId} ORDER BY ${dfdItens.sequencial}, ${dfdItens.id})`.as(
          "sequencial",
        ),
      dfdItemId: dfdItens.id,
      dfdId: dfdItens.dfdId,
      protocoloId: pcaDfds.protocoloId,
      ativo: sql<number>`1`.as("ativo"),
      inativadoEm: sql<string | null>`NULL`.as("inativado_em"),
      inativadoPor: sql<number | null>`NULL`.as("inativado_por"),
      motivo: sql<string | null>`NULL`.as("motivo"),
      criadoEm: sql<string>`CURRENT_TIMESTAMP`.as("criado_em"),
      ...retratoDoItem(),
    })
    .from(dfdItens)
    .innerJoin(pcaDfds, and(eq(pcaDfds.dfdId, dfdItens.dfdId), isNotNull(pcaDfds.protocoloId), ne(pcaDfds.acao, "excluir")))
    .where(
      and(
        eq(dfdItens.dfdId, dfdId),
        sql`NOT EXISTS (SELECT 1 FROM pca_itens y WHERE y.pca_id = ${pcaDfds.pcaId} AND y.dfd_item_id = ${dfdItens.id})`,
      ),
    );
  return db.insert(pcaItens).select(numerados);
}

/** O item do DFD REGISTRA o nº (não baixado) que tem — ou nenhum. */
export function gravarSequencialDoDfd(db: Db, dfdId: number) {
  const doNumero = (col: string) =>
    sql`(SELECT x.${sql.raw(col)} FROM pca_itens x WHERE x.dfd_item_id = ${dfdItens.id} AND x.baixado_em IS NULL ORDER BY x.id LIMIT 1)`;
  return db.update(dfdItens).set({ pcaId: doNumero("pca_id"), pcaSequencial: doNumero("sequencial") }).where(eq(dfdItens.dfdId, dfdId));
}

/** As colunas de uma BAIXA: inativo para sempre, com o motivo e quem. */
const baixa = (motivo: string, ator: number | null) => ({
  ativo: false,
  baixadoEm: sql`(CURRENT_TIMESTAMP)`,
  inativadoEm: sql`(CURRENT_TIMESTAMP)`,
  inativadoPor: ator,
  motivo,
});

/** BAIXA os nºs PENDENTES do DFD (o item foi apagado e nenhuma linha nova o reencontrou) — no fim da gravação. */
export function baixarNumerosPendentes(db: Db, dfdId: number, motivo: string, ator: number | null) {
  return db
    .update(pcaItens)
    .set(baixa(motivo, ator))
    .where(and(eq(pcaItens.dfdId, dfdId), isNull(pcaItens.dfdItemId), isNull(pcaItens.baixadoEm)));
}

/**
 * BAIXA todos os nºs (não baixados) de um DFD — ou dos DFDs de um protocolo — num PCA (`null` = em qualquer PCA) e o item
 * deixa de ter o nº: o DFD saiu do PCA (movido, devolvido, excluído). O RETRATO fica (chame `retratarNumeros` antes).
 */
export function baixarNumeros(db: Db, alvo: AlvoNumeros, pcaId: number | null, motivo: string, ator: number | null) {
  const doPca = pcaId != null ? eq(pcaItens.pcaId, pcaId) : undefined;
  const itensDoAlvo =
    "dfdId" in alvo
      ? eq(dfdItens.dfdId, alvo.dfdId)
      : inArray(dfdItens.dfdId, db.select({ id: dfds.id }).from(dfds).where(eq(dfds.protocoloId, alvo.protocoloId)));
  return [
    db
      .update(pcaItens)
      .set({ ...baixa(motivo, ator), dfdItemId: null })
      .where(and(dfdsDoAlvo(db, alvo), doPca, isNull(pcaItens.baixadoEm))),
    db
      .update(dfdItens)
      .set({ pcaId: null, pcaSequencial: null })
      .where(and(itensDoAlvo, pcaId != null ? eq(dfdItens.pcaId, pcaId) : isNotNull(dfdItens.pcaId))),
  ] as const;
}

/** A ação de um DFD que entra no PCA pelo protocolo: a dos OUTROS DFDs desse protocolo no PCA (a escolhida na
 * incorporação), senão a `sugerida` pelo assunto — a MESMA régua da entrada e da troca de protocolo. */
const acaoDoProtocolo = (dfdId: number, pcaId: number, protocoloId: number, sugerida: AcaoDfdPca) =>
  sql`COALESCE((SELECT x.acao FROM pca_dfds x WHERE x.pca_id = ${pcaId} AND x.protocolo_id = ${protocoloId} AND x.dfd_id <> ${dfdId} ORDER BY x.dfd_id LIMIT 1), ${sugerida})`;

/**
 * Põe o DFD no PCA pelo protocolo INCORPORADO em que ele está: a AÇÃO é a dos outros DFDs do protocolo no PCA (a escolhida
 * na incorporação), senão a `sugerida` pelo assunto. O vínculo legado de mesmo PCA vira vínculo do protocolo (a ação fica).
 */
export function vincularDfdAoPca(db: Db, dfdId: number, pcaId: number, protocoloId: number, sugerida: AcaoDfdPca, ator: number | null) {
  return db
    .insert(pcaDfds)
    .values({
      pcaId,
      dfdId,
      protocoloId,
      acao: acaoDoProtocolo(dfdId, pcaId, protocoloId, sugerida),
      vinculadoPor: ator,
      vinculadoEm: sql`(CURRENT_TIMESTAMP)`,
    })
    .onConflictDoUpdate({ target: [pcaDfds.pcaId, pcaDfds.dfdId], set: { protocoloId } });
}

/** O vínculo do DFD com o PCA passa a OUTRO protocolo incorporado ao MESMO PCA: os nºs ficam e a AÇÃO passa a ser a do
 * protocolo novo (um DFD que sai de um protocolo "excluir" para um "incorporar" passa a valer — e a ser numerado). */
export function trocarProtocoloDoVinculo(db: Db, dfdId: number, pcaId: number, protocoloId: number, sugerida: AcaoDfdPca) {
  return db
    .update(pcaDfds)
    .set({ protocoloId, acao: acaoDoProtocolo(dfdId, pcaId, protocoloId, sugerida) })
    .where(and(eq(pcaDfds.pcaId, pcaId), eq(pcaDfds.dfdId, dfdId)));
}

/** Tira o vínculo de INCORPORAÇÃO do DFD com um PCA (o legado, sem `protocolo_id`, nunca). */
export function desvincularDfdDoPca(db: Db, dfdId: number, pcaId: number) {
  return db.delete(pcaDfds).where(and(eq(pcaDfds.pcaId, pcaId), eq(pcaDfds.dfdId, dfdId), isNotNull(pcaDfds.protocoloId)));
}

/** Tira do PCA os vínculos dos DFDs que entraram por um protocolo (Devolver à Mesa). */
export function desvincularProtocoloDoPca(db: Db, protocoloId: number, pcaId: number) {
  return db.delete(pcaDfds).where(and(eq(pcaDfds.pcaId, pcaId), eq(pcaDfds.protocoloId, protocoloId)));
}

/** REATIVA os nºs que ficaram inativos só porque o DFD deixou de ser vigente (`motivoNaoVigente`) — ele voltou a valer. */
export function reativarVigentes(db: Db, pcaId: number, dfdIds: number[], motivoNaoVigente: string) {
  return db
    .update(pcaItens)
    .set({ ativo: true, inativadoEm: null, inativadoPor: null, motivo: null })
    .where(
      and(
        eq(pcaItens.pcaId, pcaId),
        eq(pcaItens.ativo, false),
        eq(pcaItens.motivo, motivoNaoVigente),
        isNull(pcaItens.baixadoEm),
        isNotNull(pcaItens.dfdItemId),
        inArray(pcaItens.dfdId, dfdIds),
      ),
    );
}
