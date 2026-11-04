import { and, asc, eq, ne, sql } from "drizzle-orm";
import { cache } from "react";
import { orgaos, reparticoes, subunidades } from "@/db/schema";
import { getDb } from "./db";
import { CODIGO_GERAL } from "./escopo-unidades-core";
import { type CentrosDeOutro, type ConfigSubunidades, centrosPendentes, lerCentros, lerModo, mapaCentrosCusto, type Subunidade } from "./subunidades-core";
import { consultaCentrosDosDfds, consultaCentrosPorUnidade, consultaMarcadosPorSubunidade, consultaSubunidades } from "./subunidades-sql";

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
    consultaCentrosDosDfds(db, id),
    centrosDeOutrasUnidades(id),
  ]);
  const c = cfg.get(id);
  if (!c) return null;
  const n = new Map(marcados.map((m) => [m.id, Number(m.n)]));
  return {
    modo: c.modo,
    centrosUnidade: c.centros,
    subunidades: c.subunidades.map((s) => ({ ...s, marcados: n.get(s.id) ?? 0 })),
    centros: centros.map((x) => ({ centro: String(x.centro), dfds: Number(x.dfds), daUnidade: Number(x.daUnidade ?? 0) })),
    outras,
  };
}

/** Os centros de custo das OUTRAS unidades (os delas no modo único e os das subunidades — a unicidade no sistema), com
 * quem é o dono (`subunidade` vazia = a unidade). */
export async function centrosDeOutrasUnidades(id: number): Promise<CentrosDeOutro[]> {
  const db = getDb();
  const [subs, unidades] = await Promise.all([
    db
      .select({ reparticaoId: reparticoes.id, unidade: reparticoes.codigo, subunidadeId: subunidades.id, subunidade: subunidades.nome, centros: subunidades.centrosCusto })
      .from(subunidades)
      .innerJoin(reparticoes, eq(reparticoes.id, subunidades.reparticaoId))
      .where(ne(subunidades.reparticaoId, id))
      .orderBy(asc(reparticoes.codigo), asc(subunidades.ordem)),
    db
      .select({ reparticaoId: reparticoes.id, unidade: reparticoes.codigo, centros: reparticoes.centrosCusto })
      .from(reparticoes)
      .where(and(ne(reparticoes.id, id), eq(reparticoes.modoCentro, "unico"))),
  ]);
  return [
    ...unidades.map((u) => ({ reparticaoId: u.reparticaoId, unidade: u.unidade, subunidadeId: null, subunidade: "", centros: lerCentros(u.centros) })),
    ...subs.map((l) => ({ reparticaoId: l.reparticaoId, unidade: l.unidade, subunidadeId: l.subunidadeId, subunidade: l.subunidade, centros: lerCentros(l.centros) })),
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

/** Quantos centros de custo dos DFDs de cada unidade ainda NÃO estão no cadastro dela (a lista do ADM). Três consultas. */
export async function pendentesPorUnidade(ids: number[]): Promise<Map<number, string[]>> {
  const [cfg, linhas] = await Promise.all([lerConfigSubunidades(ids), consultaCentrosPorUnidade(getDb())]);
  const por = new Map<number, string[]>();
  for (const l of linhas) if (l.reparticaoId != null) por.set(l.reparticaoId, [...(por.get(l.reparticaoId) ?? []), String(l.centro)]);
  const out = new Map<number, string[]>();
  for (const id of ids) {
    const p = centrosPendentes(cfg.get(id), por.get(id) ?? []);
    if (p.length) out.set(id, p);
  }
  return out;
}

/** O MAPA dos centros de custo de TODAS as unidades (sem a GERAL): onde cada centro está vinculado e quantos DFDs o
 * têm. Quatro consultas para qualquer quantidade. */
export async function mapaDosCentros() {
  const db = getDb();
  const [unidades, dfdsCentros] = await Promise.all([
    db
      .select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome, orgaoId: reparticoes.orgaoId, orgao: orgaos.sigla })
      .from(reparticoes)
      .leftJoin(orgaos, eq(orgaos.id, reparticoes.orgaoId))
      .where(ne(reparticoes.codigo, CODIGO_GERAL)),
    consultaCentrosPorUnidade(db),
  ]);
  const cfg = await lerConfigSubunidades(unidades.map((u) => u.id));
  const porUnidade = new Map<number, { centro: string; n: number }[]>();
  for (const d of dfdsCentros)
    if (d.reparticaoId != null) porUnidade.set(d.reparticaoId, [...(porUnidade.get(d.reparticaoId) ?? []), { centro: String(d.centro), n: Number(d.n) }]);
  return mapaCentrosCusto(
    unidades.flatMap((u) => {
      const c = cfg.get(u.id);
      return c ? [{ id: u.id, codigo: u.codigo, nome: u.nome, orgaoId: u.orgaoId, orgao: u.orgao ?? "", cfg: c }] : [];
    }),
    porUnidade,
  );
}
