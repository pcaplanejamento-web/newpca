import { and, asc, eq, isNotNull, or, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { responsaveis, responsaveisVinculos } from "../db/schema.ts";
import type { VinculoComPessoa } from "./responsaveis-planilha-core.ts";

/**
 * RESPONSÁVEIS POR DFDs (planilha + vínculos) — os comandos como BUILDERS do Drizzle (sem getDb: testados pelo driver D1
 * sobre `node:sqlite`, também DENTRO de `db.batch` — `tests/responsaveis-sql.test.ts`).
 */
type Db = DrizzleD1Database<typeof schema>;

/** Um alvo: o órgão OU a unidade (o id pode ser uma subconsulta — o órgão/unidade recém-criado no mesmo lote). */
export type AlvoSql = { orgaoId: number | SQL } | { reparticaoId: number | SQL };

const colunasVinculo = {
  id: responsaveisVinculos.id,
  responsavelId: responsaveisVinculos.responsavelId,
  orgaoId: responsaveisVinculos.orgaoId,
  reparticaoId: responsaveisVinculos.reparticaoId,
  tipo: responsaveisVinculos.tipo,
  funcao: responsaveisVinculos.funcao,
  atoTipo: responsaveisVinculos.atoTipo,
  atoNumero: responsaveisVinculos.atoNumero,
  atoLink: responsaveisVinculos.atoLink,
  inicio: responsaveisVinculos.inicio,
  fim: responsaveisVinculos.fim,
  ordem: responsaveisVinculos.ordem,
  nome: responsaveis.nome,
  matricula: responsaveis.matricula,
  cargo: responsaveis.cargo,
};

/** Os vínculos (com a pessoa) dos alvos pedidos — os ids num parâmetro JSON cada (qualquer quantidade). */
export function consultaVinculosDosAlvos(db: Db, alvos: { orgaos: number[]; unidades: number[] }) {
  const conds: SQL[] = [];
  if (alvos.orgaos.length) conds.push(sql`${responsaveisVinculos.orgaoId} IN (SELECT value FROM json_each(${JSON.stringify(alvos.orgaos)}))`);
  if (alvos.unidades.length)
    conds.push(sql`${responsaveisVinculos.reparticaoId} IN (SELECT value FROM json_each(${JSON.stringify(alvos.unidades)}))`);
  return db
    .select(colunasVinculo)
    .from(responsaveisVinculos)
    .innerJoin(responsaveis, eq(responsaveis.id, responsaveisVinculos.responsavelId))
    .where(conds.length ? or(...conds) : sql`0`)
    .orderBy(asc(responsaveisVinculos.ordem), asc(responsaveisVinculos.id));
}

/** TODOS os vínculos (a planilha inteira). */
export function consultaTodosVinculos(db: Db) {
  return db
    .select(colunasVinculo)
    .from(responsaveisVinculos)
    .innerJoin(responsaveis, eq(responsaveis.id, responsaveisVinculos.responsavelId))
    .orderBy(asc(responsaveisVinculos.ordem), asc(responsaveisVinculos.id));
}

/** Converte a linha lida (tipo/ato como texto) na forma do núcleo. */
export function linhaVinculo(l: {
  id: number;
  responsavelId: number;
  orgaoId: number | null;
  reparticaoId: number | null;
  tipo: string;
  funcao: string;
  atoTipo: string | null;
  atoNumero: string;
  atoLink: string;
  inicio: string | null;
  fim: string | null;
  ordem: number;
  nome: string;
  matricula: string;
  cargo: string;
}): VinculoComPessoa {
  const ato = l.atoTipo === "portaria" || l.atoTipo === "decreto" || l.atoTipo === "lei" ? l.atoTipo : null;
  return { ...l, tipo: l.tipo === "temporario" ? "temporario" : "padrao", atoTipo: ato };
}

function condAlvo(alvo: AlvoSql): SQL {
  return "orgaoId" in alvo ? sql`${responsaveisVinculos.orgaoId} = ${alvo.orgaoId}` : sql`${responsaveisVinculos.reparticaoId} = ${alvo.reparticaoId}`;
}

/** MOVE os vínculos de um alvo para outro (promover/rebaixar — no MESMO lote, antes de excluir a origem). */
export function comandoMoverVinculos(db: Db, de: AlvoSql, para: AlvoSql) {
  const set = "orgaoId" in para ? { orgaoId: para.orgaoId, reparticaoId: null } : { orgaoId: null, reparticaoId: para.reparticaoId };
  return db
    .update(responsaveisVinculos)
    .set(set as never)
    .where(condAlvo(de));
}

/** APAGA os vínculos de um alvo (a unidade que recebe os do órgão no lugar dos seus). */
export function comandoApagarVinculos(db: Db, alvo: AlvoSql) {
  return db.delete(responsaveisVinculos).where(condAlvo(alvo));
}

/** COPIA os vínculos de um ÓRGÃO para uma UNIDADE (promover preservando a unidade sem responsáveis próprios). */
export function comandoCopiarVinculosParaUnidade(db: Db, orgaoId: number, reparticaoId: number) {
  // As chaves na MESMA ordem das colunas da tabela (exigência do insert…select do Drizzle).
  const origem = db
    .select({
      id: sql<number>`NULL`.as("id"),
      responsavelId: responsaveisVinculos.responsavelId,
      orgaoId: sql<number>`NULL`.as("orgao_id"),
      reparticaoId: sql<number>`${reparticaoId}`.as("reparticao_id"),
      tipo: responsaveisVinculos.tipo,
      funcao: responsaveisVinculos.funcao,
      atoTipo: responsaveisVinculos.atoTipo,
      atoNumero: responsaveisVinculos.atoNumero,
      atoLink: responsaveisVinculos.atoLink,
      inicio: responsaveisVinculos.inicio,
      fim: responsaveisVinculos.fim,
      ordem: responsaveisVinculos.ordem,
      criadoEm: sql<string>`CURRENT_TIMESTAMP`.as("criado_em"),
    })
    .from(responsaveisVinculos)
    .where(and(eq(responsaveisVinculos.orgaoId, orgaoId), isNotNull(responsaveisVinculos.responsavelId)));
  return db.insert(responsaveisVinculos).select(origem);
}

/** Quantos vínculos cada alvo tem (a decisão de promover/rebaixar). */
export function consultaContaVinculos(db: Db, alvo: AlvoSql) {
  return db.select({ n: sql<number>`count(*)` }).from(responsaveisVinculos).where(condAlvo(alvo));
}
