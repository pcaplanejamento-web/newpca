import { asc, eq, sql } from "drizzle-orm";
import { centiApis } from "@/db/schema";
import { type ApiCenti, type EdicaoApi, lerDivisao, lerLista } from "./centi-apis-core";
import { getDb } from "./db";

/** O cadastro das APIs da Centi (D1) — só leitura e edição; nada aqui chama a Centi. */

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
    .set({ ...e, lista: JSON.stringify(e.lista), atualizadoEm: sql`CURRENT_TIMESTAMP` })
    .where(eq(centiApis.id, id));
}
