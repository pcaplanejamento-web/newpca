import { and, eq, lt, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { dfdItens, dfdProtocolos, dfds, mesaExcluidos, mesaLixeiraDescartados } from "../db/schema.ts";

/**
 * LIXEIRA DA MESA — os comandos como BUILDERS (testados pelo driver D1 real dentro de `db.batch`). Cada um LÊ O
 * RETRATO DO PRÓPRIO BANCO (`insert().select()`) e tem de rodar no MESMO lote da exclusão, ANTES do DELETE: atômico
 * (a exclusão que falha não deixa retrato) e sem consulta a mais.
 */
type Db = DrizzleD1Database<typeof schema>;

export type { MotivoExclusao } from "./mesa-excluidos-core.ts";
export { ROTULO_MOTIVO_EXCLUSAO } from "./mesa-excluidos-core.ts";
import type { MotivoExclusao } from "./mesa-excluidos-core.ts";
export type AtorExclusao = { id: number | null; nome: string | null };

/** O JSON de um item (as colunas que o banner mostra). `t` = o nome da tabela/alias dos itens. */
function jsonItem(t: string): SQL {
  const c = (n: string) => sql.raw(`${t}."${n}"`);
  return sql`json_object('id', ${c("id")}, 'item', ${c("item")}, 'codigo', ${c("codigo")}, 'descricao', ${c("descricao")}, 'unidade', ${c("unidade")}, 'quantidade', ${c("quantidade")}, 'valorUnitario', ${c("valor_unitario")}, 'valorTotal', ${c("valor_total")}, 'sequencial', ${c("sequencial")}, 'pcaId', ${c("pca_id")}, 'pcaSequencial', ${c("pca_sequencial")}, 'classificacao', ${c("classificacao")}, 'dominio', ${c("dominio")})`;
}

/** O retrato do DFD (cabeçalho + seções + assinaturas + itens). */
const RETRATO_DFD = sql`json_object(
  'numero', "dfds"."numero", 'planejamento', "dfds"."planejamento", 'tipo', "dfds"."tipo", 'objeto', "dfds"."objeto",
  'orgaoEntidade', "dfds"."orgao_entidade", 'setorRequisitante', "dfds"."setor_requisitante", 'siglaSetor', "dfds"."sigla_setor",
  'reparticaoId', "dfds"."reparticao_id", 'responsavel', "dfds"."responsavel", 'matricula', "dfds"."matricula",
  'email', "dfds"."email", 'telefone', "dfds"."telefone", 'anoPca', "dfds"."ano_pca",
  'numeroContrato', "dfds"."numero_contrato", 'numeroAta', "dfds"."numero_ata", 'numeroLicitacao', "dfds"."numero_licitacao",
  'valorTotal', "dfds"."valor_total", 'totalItens', "dfds"."total_itens", 'secoes', "dfds"."secoes",
  'assinaturas', "dfds"."assinaturas", 'nomeArquivo', "dfds"."nome_arquivo", 'protocoloId', "dfds"."protocolo_id",
  'criadoEm', "dfds"."criado_em", 'atualizadoEm', "dfds"."atualizado_em", 'criadoPor', "dfds"."criado_por",
  'criadoPorNome', (SELECT u."nome" FROM "usuarios" u WHERE u."id" = "dfds"."criado_por"),
  'orgaoId', "dfds"."orgao_id", 'orgaoNome', (SELECT o."nome" FROM "orgaos" o WHERE o."id" = "dfds"."orgao_id"),
  'protocoloNumero', (SELECT p."numero" FROM "dfd_protocolos" p WHERE p."id" = "dfds"."protocolo_id"),
  'execucaoCenti', "dfds"."execucao_centi", 'execucaoCentiEm', "dfds"."execucao_centi_em",
  'conferenciaCenti', "dfds"."conferencia_centi", 'conferenciaCentiMotivo', "dfds"."conferencia_centi_motivo",
  'itens', (SELECT json_group_array(${jsonItem("di")}) FROM "dfd_itens" di WHERE di."dfd_id" = "dfds"."id")
)`;

/** As colunas comuns de toda linha da lixeira (na ordem da tabela, depois do retrato). */
function comuns(motivo: MotivoExclusao, retrato: SQL, ator: AtorExclusao) {
  return {
    motivo: sql<string>`${motivo}`.as("motivo"),
    retrato: sql<string>`${retrato}`.as("retrato"),
    excluidoPor: sql<number | null>`${ator.id}`.as("excluido_por"),
    excluidoNome: sql<string | null>`${ator.nome}`.as("excluido_nome"),
    excluidoEm: sql<string>`CURRENT_TIMESTAMP`.as("excluido_em"),
    restauradoEm: sql<string | null>`NULL`.as("restaurado_em"),
  };
}

/** Os DFDs (um ou todos de um protocolo) — um retrato por DFD. */
export function comandoRetratoDfds(db: Db, alvo: { dfdId: number } | { protocoloId: number }, motivo: MotivoExclusao, ator: AtorExclusao) {
  const sel = db
    .select({
      id: sql<number>`NULL`.as("id"),
      tipo: sql<string>`'dfd'`.as("tipo"),
      alvoId: dfds.id,
      numero: dfds.numero,
      planejamento: dfds.planejamento,
      protocoloId: dfds.protocoloId,
      protocoloNumero: sql<string | null>`${dfdProtocolos.numero}`.as("protocolo_numero"),
      dfdId: sql<number>`${dfds.id}`.as("dfd_id"),
      reparticaoId: dfds.reparticaoId,
      pcaId: dfdProtocolos.pcaId,
      valor: dfds.valorTotal,
      ...comuns(motivo, sql`${RETRATO_DFD}`, ator),
    })
    .from(dfds)
    .leftJoin(dfdProtocolos, eq(dfdProtocolos.id, dfds.protocoloId))
    .where("dfdId" in alvo ? eq(dfds.id, alvo.dfdId) : eq(dfds.protocoloId, alvo.protocoloId));
  return db.insert(mesaExcluidos).select(sel);
}

/** A capa do protocolo (os DFDs dele vão em `comandoRetratoDfds` com o motivo `cascata`). */
export function comandoRetratoProtocolo(db: Db, protocoloId: number, motivo: MotivoExclusao, ator: AtorExclusao) {
  const p = (n: string) => sql.raw(`"dfd_protocolos"."${n}"`);
  const retrato = sql`json_object('numero', ${p("numero")}, 'idExterno', ${p("id_externo")}, 'data', ${p("data")}, 'interessado', ${p("interessado")}, 'assunto', ${p("assunto")}, 'observacao', ${p("observacao")}, 'valorCapa', ${p("valor_capa")}, 'anoPca', ${p("ano_pca")}, 'reparticaoId', ${p("reparticao_id")}, 'localReparticao', ${p("local_reparticao")}, 'pcaId', ${p("pca_id")}, 'criadoEm', ${p("criado_em")}, 'atualizadoEm', ${p("atualizado_em")}, 'documento', ${p("documento")}, 'nomeArquivo', ${p("nome_arquivo")}, 'orgaoId', ${p("orgao_id")}, 'orgaoNome', (SELECT o."nome" FROM "orgaos" o WHERE o."id" = ${p("orgao_id")}), 'responsavelId', ${p("responsavel_id")}, 'responsavelNome', (SELECT COALESCE(NULLIF(u."apelido", ''), u."nome") FROM "usuarios" u WHERE u."id" = ${p("responsavel_id")}), 'situacao', (SELECT s."nome" FROM "protocolo_situacoes" s WHERE s."id" = ${p("situacao_id")}), 'criadoPorNome', (SELECT u."nome" FROM "usuarios" u WHERE u."id" = ${p("criado_por")}), 'pcaNome', (SELECT x."nome" FROM "pcas" x WHERE x."id" = ${p("pca_id")}), 'pcaEnviadoEm', ${p("pca_enviado_em")}, 'pcaIncorporadoEm', ${p("pca_incorporado_em")}, 'valorDfds', (SELECT ROUND(SUM("dfds"."valor_total"), 4) FROM "dfds" WHERE "dfds"."protocolo_id" = ${p("id")}), 'itens', (SELECT COUNT(*) FROM "dfd_itens" di JOIN "dfds" ON "dfds"."id" = di."dfd_id" WHERE "dfds"."protocolo_id" = ${p("id")}), 'dfds', (SELECT COUNT(*) FROM "dfds" WHERE "dfds"."protocolo_id" = ${p("id")}))`;
  const sel = db
    .select({
      id: sql<number>`NULL`.as("id"),
      tipo: sql<string>`'protocolo'`.as("tipo"),
      alvoId: dfdProtocolos.id,
      numero: dfdProtocolos.numero,
      planejamento: sql<string | null>`NULL`.as("planejamento"),
      protocoloId: sql<number>`${dfdProtocolos.id}`.as("protocolo_id"),
      protocoloNumero: sql<string>`${dfdProtocolos.numero}`.as("protocolo_numero"),
      dfdId: sql<number | null>`NULL`.as("dfd_id"),
      reparticaoId: dfdProtocolos.reparticaoId,
      pcaId: dfdProtocolos.pcaId,
      valor: sql<number | null>`(SELECT ROUND(SUM("dfds"."valor_total"), 4) FROM "dfds" WHERE "dfds"."protocolo_id" = ${p("id")})`.as("valor"),
      ...comuns(motivo, sql`${retrato}`, ator),
    })
    .from(dfdProtocolos)
    .where(eq(dfdProtocolos.id, protocoloId));
  return db.insert(mesaExcluidos).select(sel);
}

/** Itens avulsos removidos de um DFD (os ids num parâmetro JSON — qualquer quantidade, ≤ 100 parâmetros). */
export function comandoRetratoItens(db: Db, dfdId: number, ids: number[], motivo: MotivoExclusao, ator: AtorExclusao) {
  const sel = db
    .select({
      id: sql<number>`NULL`.as("id"),
      tipo: sql<string>`'item'`.as("tipo"),
      alvoId: dfdItens.id,
      numero: sql<string | null>`CAST(${dfdItens.item} AS TEXT)`.as("numero"),
      planejamento: dfds.planejamento,
      protocoloId: dfds.protocoloId,
      protocoloNumero: sql<string | null>`${dfdProtocolos.numero}`.as("protocolo_numero"),
      dfdId: dfdItens.dfdId,
      reparticaoId: dfds.reparticaoId,
      pcaId: dfdProtocolos.pcaId,
      valor: dfdItens.valorTotal,
      ...comuns(motivo, sql`json_object('item', ${jsonItem('"dfd_itens"')}, 'dfdNumero', "dfds"."numero", 'dfdTipo', "dfds"."tipo", 'dfdPlanejamento', "dfds"."planejamento", 'dfdObjeto', "dfds"."objeto", 'dfdSigla', "dfds"."sigla_setor", 'dfdAnoPca', "dfds"."ano_pca", 'protocoloNumero', "dfd_protocolos"."numero")`, ator),
    })
    .from(dfdItens)
    .innerJoin(dfds, eq(dfds.id, dfdItens.dfdId))
    .leftJoin(dfdProtocolos, eq(dfdProtocolos.id, dfds.protocoloId))
    .where(and(eq(dfdItens.dfdId, dfdId), sql`${dfdItens.id} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`));
  return db.insert(mesaExcluidos).select(sel);
}

/** Retenção: tira o que foi excluído antes de `antes` (ISO). */
export function comandoLimparExcluidos(db: Db, antes: string) {
  return db.delete(mesaExcluidos).where(lt(mesaExcluidos.excluidoEm, antes));
}


/** A limpeza DEFINITIVA de linhas da lixeira (os ids num parâmetro JSON). */
export function comandoApagarExcluidos(db: Db, ids: number[]) {
  return db.delete(mesaExcluidos).where(sql`${mesaExcluidos.id} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`);
}
/** As exclusões antigas (do histórico) limpas da lixeira — 40 chaves por INSERT. */
export function comandosDescartarAntigos(db: Db, chaves: string[]) {
  const out = [];
  for (let i = 0; i < chaves.length; i += 40) out.push(db.insert(mesaLixeiraDescartados).values(chaves.slice(i, i + 40).map((chave) => ({ chave }))).onConflictDoNothing());
  return out;
}
