import { and, asc, eq, ne, sql } from "drizzle-orm";
import { centiApis, orgaos, reparticoes } from "@/db/schema";
import { type ApiCenti, codigoCenti, type EdicaoApi, lerDivisao, lerLista, type OrgaoDoCadastro, type UnidadeDoCadastro } from "./centi-apis-core";
import { getDb } from "./db";
import { ORDEM_ORGAOS } from "./orgaos";

/** O cadastro das APIs da Centi (D1) — leitura e edição; o TESTE fica na rota (nada é gravado). */

type Linha = typeof centiApis.$inferSelect;

function paraApi(l: Linha): ApiCenti {
  return {
    id: l.id,
    chave: l.chave,
    nome: l.nome,
    descricao: l.descricao,
    urlBase: l.urlBase,
    endpoint: l.endpoint,
    uf: l.uf,
    tenant: l.tenant,
    divisao: lerDivisao(l.divisao),
    paginado: l.paginado,
    parametros: l.parametros,
    lista: lerLista(l.lista),
    orgaos: lerLista(l.orgaos),
    unidades: lerLista(l.unidades),
    ativa: l.ativa,
    implementada: l.implementada,
    frequenciaMin: l.frequenciaMin,
    diasUteis: l.diasUteis,
    horaInicio: l.horaInicio,
    horaFim: l.horaFim,
    anos: l.anos,
    ordem: l.ordem,
    ultimaExecucao: l.ultimaExecucao,
    ultimoStatus: l.ultimoStatus,
    ultimaContagem: l.ultimaContagem,
    ultimoTotal: l.ultimoTotal,
  };
}

export async function listarApisCenti(): Promise<ApiCenti[]> {
  const linhas = await getDb().select().from(centiApis).orderBy(asc(centiApis.ordem), asc(centiApis.id));
  return linhas.map(paraApi);
}

export async function getApiCenti(id: number): Promise<ApiCenti | null> {
  const [l] = await getDb().select().from(centiApis).where(eq(centiApis.id, id)).limit(1);
  return l ? paraApi(l) : null;
}

export async function atualizarApiCenti(id: number, e: EdicaoApi): Promise<void> {
  await getDb()
    .update(centiApis)
    .set({ ...e, lista: JSON.stringify(e.lista), orgaos: JSON.stringify(e.orgaos), unidades: JSON.stringify(e.unidades), atualizadoEm: sql`CURRENT_TIMESTAMP` })
    .where(eq(centiApis.id, id));
}

/** Os órgãos do cadastro (não ocultos) com o código na Centi — a escolha e os pedidos por órgão. */
export async function orgaosDoCadastro(): Promise<OrgaoDoCadastro[]> {
  const l = await getDb()
    .select({ id: orgaos.id, sigla: orgaos.sigla, nome: orgaos.nome, entidadeCenti: orgaos.entidadeCenti })
    .from(orgaos)
    .where(eq(orgaos.oculto, false))
    .orderBy(...ORDEM_ORGAOS);
  return l.map((o) => ({ id: o.id, sigla: o.sigla, nome: o.nome, codigoCenti: codigoCenti(o.entidadeCenti) }));
}

/** As unidades do cadastro (não ocultas, sem a "Geral"), com o órgão de cada uma. */
export async function unidadesDoCadastro(): Promise<UnidadeDoCadastro[]> {
  return getDb()
    .select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome, orgaoId: reparticoes.orgaoId })
    .from(reparticoes)
    .where(and(eq(reparticoes.oculto, false), ne(reparticoes.codigo, "GERAL")))
    .orderBy(asc(reparticoes.ordem), asc(reparticoes.nome));
}

/** A última leitura da API (a coluna "Última leitura" e o estado na tela). */
export async function registrarLeitura(id: number, status: "completo" | "parcial" | "falhou", contagem: number, total: number | null): Promise<void> {
  await getDb()
    .update(centiApis)
    .set({ ultimaExecucao: sql`CURRENT_TIMESTAMP`, ultimoStatus: status, ultimaContagem: contagem, ultimoTotal: total })
    .where(eq(centiApis.id, id));
}
