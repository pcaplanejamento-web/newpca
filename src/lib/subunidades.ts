import { asc, eq, ne, sql } from "drizzle-orm";
import { cache } from "react";
import { reparticoes, subunidades } from "@/db/schema";
import { getDb } from "./db";
import { CODIGO_GERAL } from "./escopo-unidades-core";
import { type ConfigSubunidades, lerCentros, lerVinculo, type Subunidade } from "./subunidades-core";
import { consultaCentrosDosDfds, consultaMarcadosPorSubunidade, consultaSubunidades } from "./subunidades-sql";

/** As subunidades de várias unidades (`id da unidade → lista`) — uma consulta. */
async function subunidadesDe(ids: number[]): Promise<Map<number, Subunidade[]>> {
  const m = new Map<number, Subunidade[]>();
  if (!ids.length) return m;
  for (const r of await consultaSubunidades(getDb(), ids)) {
    const l = m.get(r.reparticaoId) ?? [];
    l.push({ id: r.id, nome: r.nome, centros: lerCentros(r.centros) });
    m.set(r.reparticaoId, l);
  }
  return m;
}

/**
 * A CONFIGURAÇÃO das subunidades das unidades pedidas (o vínculo + as subunidades, na ordem) — duas consultas para
 * qualquer quantidade.
 */
export async function lerConfigSubunidades(ids: number[]): Promise<Map<number, ConfigSubunidades>> {
  const out = new Map<number, ConfigSubunidades>();
  if (!ids.length) return out;
  const [unidades, subs] = await Promise.all([
    getDb()
      .select({ id: reparticoes.id, codigo: reparticoes.codigo, vinculo: reparticoes.vinculoSubunidade })
      .from(reparticoes)
      .where(sql`${reparticoes.id} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`),
    subunidadesDe(ids),
  ]);
  for (const u of unidades) out.set(u.id, { codigo: u.codigo, vinculo: lerVinculo(u.vinculo), subunidades: subs.get(u.id) ?? [] });
  return out;
}

const configMemo = cache((chave: string) => lerConfigSubunidades(chave ? chave.split(",").map(Number) : []));

/** `lerConfigSubunidades` MEMORIZADA por requisição (a chave ordenada — o `cache` compara pelo valor). Quem grava lê
 * com `lerConfigSubunidades` (sem memória). */
export const configDasUnidades = (ids: number[]) => configMemo([...new Set(ids)].filter(Number.isInteger).sort((a, b) => a - b).join(","));

/** O cadastro de UMA unidade para o ADM: a configuração, quantos DFDs cada subunidade tem marcados, as OPÇÕES de centro
 * de custo (as gravadas nos DFDs) e os centros que já pertencem a subunidades de OUTRAS unidades. */
export async function cadastroDaUnidade(id: number) {
  const db = getDb();
  const [cfg, marcados, centros, outras] = await Promise.all([
    lerConfigSubunidades([id]),
    consultaMarcadosPorSubunidade(db, id),
    consultaCentrosDosDfds(db),
    centrosDeOutrasUnidades(id),
  ]);
  const c = cfg.get(id);
  if (!c) return null;
  const n = new Map(marcados.map((m) => [m.id, Number(m.n)]));
  return {
    vinculo: c.vinculo,
    subunidades: c.subunidades.map((s) => ({ ...s, marcados: n.get(s.id) ?? 0 })),
    centros: centros.map((x) => ({ centro: String(x.centro), dfds: Number(x.dfds) })),
    outras,
  };
}

/** Os centros de custo das subunidades das OUTRAS unidades (a unicidade no sistema), com quem é o dono. */
export async function centrosDeOutrasUnidades(id: number) {
  const linhas = await getDb()
    .select({ unidade: reparticoes.codigo, subunidade: subunidades.nome, centros: subunidades.centrosCusto })
    .from(subunidades)
    .innerJoin(reparticoes, eq(reparticoes.id, subunidades.reparticaoId))
    .where(ne(subunidades.reparticaoId, id))
    .orderBy(asc(reparticoes.codigo), asc(subunidades.ordem));
  return linhas.map((l) => ({ unidade: l.unidade, subunidade: l.subunidade, centros: lerCentros(l.centros) })).filter((l) => l.centros.length);
}

/** As subunidades de TODAS as unidades (a coluna "Subunidades" da lista do ADM): `id da unidade → nomes`. */
export async function nomesDasSubunidades(): Promise<Map<number, string[]>> {
  const linhas = await getDb()
    .select({ reparticaoId: subunidades.reparticaoId, nome: subunidades.nome })
    .from(subunidades)
    .innerJoin(reparticoes, eq(reparticoes.id, subunidades.reparticaoId))
    .where(ne(reparticoes.codigo, CODIGO_GERAL))
    .orderBy(asc(subunidades.reparticaoId), asc(subunidades.ordem), asc(subunidades.id));
  const m = new Map<number, string[]>();
  for (const l of linhas) m.set(l.reparticaoId, [...(m.get(l.reparticaoId) ?? []), l.nome]);
  return m;
}
