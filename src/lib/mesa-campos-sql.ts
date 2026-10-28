import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { dfdProtocolos, dfds, orgaos, usuarios } from "../db/schema.ts";

type Db = DrizzleD1Database<typeof schema>;

/** Os ids num só parâmetro JSON (o padrão de `pca-dfds-sql.ts`) — qualquer quantidade, um parâmetro. */
const dosIds = (col: typeof dfdProtocolos.id | typeof dfds.id, ids: readonly number[]) => sql`${col} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`;

/** O nome de exibição de quem (apelido › nome). */
const nomeDe = sql<string | null>`COALESCE(NULLIF(${usuarios.apelido}, ''), ${usuarios.nome})`;

/**
 * Os campos EXTRAS dos PROTOCOLOS (colunas da Mesa sob demanda) — com a unidade (o escopo) para a rota conferir antes de
 * devolver. Uma consulta. Builder sem getDb (testado pelo driver D1 real).
 */
export function consultaCamposProtocolos(db: Db, ids: readonly number[]) {
  return db
    .select({
      id: dfdProtocolos.id,
      reparticaoId: dfdProtocolos.reparticaoId,
      interessado: dfdProtocolos.interessado,
      documento: dfdProtocolos.documento,
      observacao: dfdProtocolos.observacao,
      dataCapa: dfdProtocolos.data,
      valorCapa: dfdProtocolos.valorCapa,
      local: dfdProtocolos.localReparticao,
      orgao: orgaos.nome,
      arquivo: dfdProtocolos.nomeArquivo,
      enviadoEm: dfdProtocolos.pcaEnviadoEm,
      enviadoPor: nomeDe,
      incorporadoEm: dfdProtocolos.pcaIncorporadoEm,
      atualizadoEm: dfdProtocolos.atualizadoEm,
    })
    .from(dfdProtocolos)
    .leftJoin(orgaos, sql`${orgaos.id} = ${dfdProtocolos.orgaoId}`)
    .leftJoin(usuarios, sql`${usuarios.id} = ${dfdProtocolos.pcaEnviadoPor}`)
    .where(dosIds(dfdProtocolos.id, ids));
}

/** Os campos EXTRAS dos DFDs — `comSecoes` traz o JSON das seções (só quando uma coluna de seção está ligada). */
export function consultaCamposDfds(db: Db, ids: readonly number[], comSecoes: boolean) {
  return db
    .select({
      id: dfds.id,
      reparticaoId: dfds.reparticaoId,
      protocoloId: dfds.protocoloId,
      objeto: dfds.objeto,
      orgaoEntidade: dfds.orgaoEntidade,
      setor: dfds.setorRequisitante,
      responsavel: dfds.responsavel,
      matricula: dfds.matricula,
      email: dfds.email,
      telefone: dfds.telefone,
      anoProprio: dfds.anoPca,
      contrato: dfds.numeroContrato,
      ata: dfds.numeroAta,
      licitacao: dfds.numeroLicitacao,
      arquivo: dfds.nomeArquivo,
      criadoEm: dfds.criadoEm,
      criadoPor: nomeDe,
      atualizadoEm: dfds.atualizadoEm,
      execucaoEm: dfds.execucaoCentiEm,
      conferenciaMotivo: dfds.conferenciaCentiMotivo,
      secoes: comSecoes ? dfds.secoes : sql<string | null>`NULL`,
    })
    .from(dfds)
    .leftJoin(usuarios, sql`${usuarios.id} = ${dfds.criadoPor}`)
    .where(dosIds(dfds.id, ids));
}
