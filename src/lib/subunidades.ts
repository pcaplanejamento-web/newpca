import { and, asc, eq, ne, sql } from "drizzle-orm";
import { cache } from "react";
import { reparticoes, subunidades } from "@/db/schema";
import { getDb } from "./db";
import { CODIGO_GERAL } from "./escopo-unidades-core";
import { type ConfigSubunidades, lerCentros, lerModo, type Subunidade } from "./subunidades-core";
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
 * O CADASTRO de centro de custo das unidades pedidas (o modo + as subunidades, na ordem) — duas consultas para
 * qualquer quantidade.
 */
export async function lerConfigSubunidades(ids: number[]): Promise<Map<number, ConfigSubunidades>> {
  const out = new Map<number, ConfigSubunidades>();
  if (!ids.length) return out;
  const [unidades, subs] = await Promise.all([
    getDb()
      .select({ id: reparticoes.id, codigo: reparticoes.codigo, modo: reparticoes.modoCentro, centros: reparticoes.centrosCusto })
      .from(reparticoes)
      .where(sql`${reparticoes.id} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`),
    subunidadesDe(ids),
  ]);
  for (const u of unidades) out.set(u.id, { codigo: u.codigo, modo: lerModo(u.modo), centros: lerModo(u.modo) === "unico" ? lerCentros(u.centros) : [], subunidades: subs.get(u.id) ?? [] });
  return out;
}

const configMemo = cache((chave: string) => lerConfigSubunidades(chave ? chave.split(",").map(Number) : []));

/** `lerConfigSubunidades` MEMORIZADA por requisição (a chave ordenada — o `cache` compara pelo valor). Quem grava lê
 * com `lerConfigSubunidades` (sem memória). */
export const configDasUnidades = (ids: number[]) => configMemo([...new Set(ids)].filter(Number.isInteger).sort((a, b) => a - b).join(","));

/** O cadastro de UMA unidade para o ADM: o modo, os centros da unidade, as subunidades (com quantos DFDs cada uma tem
 * escolhida), as OPÇÕES de centro de custo (as gravadas nos DFDs) e os centros que já são de OUTRAS unidades. */
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
    modo: c.modo,
    centrosUnidade: c.centros,
    subunidades: c.subunidades.map((s) => ({ ...s, marcados: n.get(s.id) ?? 0 })),
    centros: centros.map((x) => ({ centro: String(x.centro), dfds: Number(x.dfds) })),
    outras,
  };
}

/** Os centros de custo das OUTRAS unidades (os delas no modo único e os das subunidades — a unicidade no sistema), com
 * quem é o dono (`subunidade` vazia = a unidade). */
export async function centrosDeOutrasUnidades(id: number) {
  const db = getDb();
  const [subs, unidades] = await Promise.all([
    db
      .select({ unidade: reparticoes.codigo, subunidade: subunidades.nome, centros: subunidades.centrosCusto })
      .from(subunidades)
      .innerJoin(reparticoes, eq(reparticoes.id, subunidades.reparticaoId))
      .where(ne(subunidades.reparticaoId, id))
      .orderBy(asc(reparticoes.codigo), asc(subunidades.ordem)),
    db
      .select({ unidade: reparticoes.codigo, centros: reparticoes.centrosCusto })
      .from(reparticoes)
      .where(and(ne(reparticoes.id, id), eq(reparticoes.modoCentro, "unico"))),
  ]);
  return [
    ...unidades.map((u) => ({ unidade: u.unidade, subunidade: "", centros: lerCentros(u.centros) })),
    ...subs.map((l) => ({ unidade: l.unidade, subunidade: l.subunidade, centros: lerCentros(l.centros) })),
  ].filter((l) => l.centros.length);
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
