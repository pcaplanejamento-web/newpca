import { asc, eq, sql } from "drizzle-orm";
import { catalogoItens, dfdItens, dfds, itemClassificacoes, unidadesMedida } from "@/db/schema";
import { getDb } from "./db";
import {
  type ClassificacaoItem,
  conflitoPalavra,
  conflitoUnidade,
  type DescricaoItem,
  limparEspacos,
  limparPalavras,
  limparSinonimos,
  nomeEmUso,
  type Padronizacao,
  type UnidadeMedida,
  type UsoUnidade,
} from "./padronizacao-core";
import { gravarSinonimosSeIgual } from "./padronizacao-sql";
import type { DadosClassificacaoItem, DadosUnidadeMedida } from "./padronizacao-validation";

/**
 * Acesso ao D1 da PADRONIZAÇÃO (Catálogo → Unidades de medida | Classificações) — os dois cadastros e o que os itens
 * usam (as grafias de unidade e as descrições, para a comparação e a classificação automática). A lógica fica no núcleo
 * puro (`padronizacao-core`). Só escopo de request (usa `getDb`).
 */

/** JSON `string[]` do banco, tolerante a lixo. */
function listaTextos(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const COLS_UNIDADE = {
  id: unidadesMedida.id,
  sigla: unidadesMedida.sigla,
  nome: unidadesMedida.nome,
  sinonimos: unidadesMedida.sinonimos,
  classificacaoId: unidadesMedida.classificacaoId,
  ordem: unidadesMedida.ordem,
};
const COLS_CLASSIFICACAO = {
  id: itemClassificacoes.id,
  nome: itemClassificacoes.nome,
  cor: itemClassificacoes.cor,
  palavras: itemClassificacoes.palavras,
  ordem: itemClassificacoes.ordem,
};

export async function listarUnidadesMedida(): Promise<UnidadeMedida[]> {
  const rs = await getDb().select(COLS_UNIDADE).from(unidadesMedida).orderBy(asc(unidadesMedida.ordem), asc(unidadesMedida.id));
  return rs.map((r) => ({ ...r, sinonimos: listaTextos(r.sinonimos) }));
}

export async function listarClassificacoes(): Promise<ClassificacaoItem[]> {
  const rs = await getDb()
    .select(COLS_CLASSIFICACAO)
    .from(itemClassificacoes)
    .orderBy(asc(itemClassificacoes.ordem), asc(itemClassificacoes.id));
  return rs.map((r) => ({ ...r, palavras: listaTextos(r.palavras) }));
}

/** Os dois cadastros (Mesa → Itens: a unidade comparada e a classificação de cada item). */
export async function listarPadronizacao(): Promise<Padronizacao> {
  const [unidades, classificacoes] = await Promise.all([listarUnidadesMedida(), listarClassificacoes()]);
  return { unidades, classificacoes };
}

export async function getUnidadeMedida(id: number): Promise<UnidadeMedida | null> {
  const [r] = await getDb().select(COLS_UNIDADE).from(unidadesMedida).where(eq(unidadesMedida.id, id)).limit(1);
  return r ? { ...r, sinonimos: listaTextos(r.sinonimos) } : null;
}

export async function getClassificacao(id: number): Promise<ClassificacaoItem | null> {
  const [r] = await getDb().select(COLS_CLASSIFICACAO).from(itemClassificacoes).where(eq(itemClassificacoes.id, id)).limit(1);
  return r ? { ...r, palavras: listaTextos(r.palavras) } : null;
}

type DadosUnidade = { sigla: string; nome: string; sinonimos: string[]; classificacaoId: number | null };
type DadosClassificacao = { nome: string; cor: string; palavras: string[] };
type Recusa = { erro: string; status: number };

/**
 * Unidade PRONTA para gravar (`id` = a editada; `null` = nova): sinônimos limpos (sem repetir a mesma grafia nem a
 * sigla/nome) — ou a RECUSA: uma grafia que já é de OUTRA unidade (409; uma grafia pertence a uma unidade só) ou a
 * classificação indicada que não existe (422).
 */
export async function prepararUnidade(d: DadosUnidadeMedida, id: number | null): Promise<{ dados: DadosUnidade } | Recusa> {
  const [unidades, classificacao] = await Promise.all([
    listarUnidadesMedida(),
    d.classificacaoId != null ? getClassificacao(d.classificacaoId) : Promise.resolve(null),
  ]);
  if (d.classificacaoId != null && !classificacao) return { erro: "A classificação escolhida não existe mais.", status: 422 };
  const sigla = limparEspacos(d.sigla);
  const nome = limparEspacos(d.nome);
  const dados = { sigla, nome, sinonimos: limparSinonimos(sigla, nome, d.sinonimos), classificacaoId: d.classificacaoId };
  const c = conflitoUnidade(dados, unidades, id);
  if (c) return { erro: `"${c.grafia}" já é uma grafia da unidade ${c.unidade.sigla} (${c.unidade.nome}).`, status: 409 };
  return { dados };
}

/** Classificação PRONTA para gravar: palavras-chave limpas — ou a RECUSA (nome repetido; palavra-chave de OUTRA). */
export async function prepararClassificacao(d: DadosClassificacaoItem, id: number | null): Promise<{ dados: DadosClassificacao } | Recusa> {
  const classificacoes = await listarClassificacoes();
  const nome = limparEspacos(d.nome);
  const mesmoNome = nomeEmUso(nome, classificacoes, id);
  if (mesmoNome) return { erro: `Já existe a classificação "${mesmoNome.nome}".`, status: 409 };
  const palavras = limparPalavras(d.palavras);
  const c = conflitoPalavra(palavras, classificacoes, id);
  if (c) return { erro: `A palavra-chave "${c.termo}" já é da classificação "${c.classificacao.nome}".`, status: 409 };
  return { dados: { nome, cor: d.cor, palavras } };
}

/** Cria no FIM da ordem. */
export async function criarUnidadeMedida(d: DadosUnidade): Promise<{ id: number }> {
  const db = getDb();
  const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${unidadesMedida.ordem}), -1)` }).from(unidadesMedida);
  const [row] = await db
    .insert(unidadesMedida)
    .values({ sigla: d.sigla, nome: d.nome, sinonimos: JSON.stringify(d.sinonimos), classificacaoId: d.classificacaoId, ordem: Number(max) + 1 })
    .returning({ id: unidadesMedida.id });
  return { id: row.id };
}

export async function atualizarUnidadeMedida(id: number, d: DadosUnidade): Promise<void> {
  await getDb()
    .update(unidadesMedida)
    .set({ sigla: d.sigla, nome: d.nome, sinonimos: JSON.stringify(d.sinonimos), classificacaoId: d.classificacaoId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(unidadesMedida.id, id));
}

export async function excluirUnidadeMedida(id: number): Promise<void> {
  await getDb().delete(unidadesMedida).where(eq(unidadesMedida.id, id));
}

/**
 * Grava os SINÔNIMOS de várias unidades num lote atômico — a lista inteira de cada uma (já mesclada pela rota), cada
 * uma SÓ se a gravada ainda é a `lidos` (compare-and-set, `gravarSinonimosSeIgual`): devolve os ids GRAVADOS — o que
 * ficou de fora mudou no meio (outra pessoa) e não é sobrescrito.
 */
export async function gravarSinonimos(porUnidade: Map<number, { lidos: string[]; novos: string[] }>): Promise<Set<number>> {
  const db = getDb();
  const stmts = [...porUnidade].map(([id, v]) => gravarSinonimosSeIgual(db, id, v.lidos, v.novos));
  if (stmts.length === 0) return new Set();
  const res = await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
  return new Set(res.flat().map((r) => r.id));
}

/** Nova ordem (índice = posição na lista). */
export async function reordenarUnidadesMedida(ids: number[]): Promise<void> {
  const db = getDb();
  if (ids.length === 0) return;
  const stmts = ids.map((id, i) => db.update(unidadesMedida).set({ ordem: i, atualizadoEm: sql`(CURRENT_TIMESTAMP)` }).where(eq(unidadesMedida.id, id)));
  await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
}

/** Cria no FIM da ordem. */
export async function criarClassificacao(d: DadosClassificacao): Promise<{ id: number }> {
  const db = getDb();
  const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${itemClassificacoes.ordem}), -1)` }).from(itemClassificacoes);
  const [row] = await db
    .insert(itemClassificacoes)
    .values({ nome: d.nome, cor: d.cor, palavras: JSON.stringify(d.palavras), ordem: Number(max) + 1 })
    .returning({ id: itemClassificacoes.id });
  return { id: row.id };
}

export async function atualizarClassificacao(id: number, d: DadosClassificacao): Promise<void> {
  await getDb()
    .update(itemClassificacoes)
    .set({ nome: d.nome, cor: d.cor, palavras: JSON.stringify(d.palavras), atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(itemClassificacoes.id, id));
}

/** As unidades que INDICAM a classificação (a exclusão as deixa sem classificação — a rota registra cada uma). */
export async function unidadesDaClassificacao(id: number): Promise<{ id: number; sigla: string }[]> {
  return getDb().select({ id: unidadesMedida.id, sigla: unidadesMedida.sigla }).from(unidadesMedida).where(eq(unidadesMedida.classificacaoId, id));
}

/** Exclui a classificação e LIMPA a das unidades que a indicavam — num lote atômico (além da FK `set null`). */
export async function excluirClassificacao(id: number): Promise<void> {
  const db = getDb();
  await db.batch([
    db.update(unidadesMedida).set({ classificacaoId: null }).where(eq(unidadesMedida.classificacaoId, id)),
    db.delete(itemClassificacoes).where(eq(itemClassificacoes.id, id)),
  ]);
}

/** Nova ordem (índice = posição na lista) — a ordem desempata a classificação automática. */
export async function reordenarClassificacoes(ids: number[]): Promise<void> {
  const db = getDb();
  if (ids.length === 0) return;
  const stmts = ids.map((id, i) => db.update(itemClassificacoes).set({ ordem: i, atualizadoEm: sql`(CURRENT_TIMESTAMP)` }).where(eq(itemClassificacoes.id, id)));
  await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
}

/**
 * USO das unidades nos itens — cada GRAFIA crua com quantos itens a usam: os de DFD no escopo da unidade ativa
 * (`reparticaoId`; sem ela = todos, como a Mesa em "Geral") e os do catálogo (base global). Duas consultas agregadas.
 */
export async function usoDasUnidades(reparticaoId?: number): Promise<UsoUnidade[]> {
  const db = getDb();
  const [doDfd, doCatalogo] = await Promise.all([
    db
      .select({ texto: dfdItens.unidade, n: sql<number>`COUNT(*)` })
      .from(dfdItens)
      .innerJoin(dfds, eq(dfdItens.dfdId, dfds.id))
      .where(reparticaoId ? eq(dfds.reparticaoId, reparticaoId) : undefined)
      .groupBy(dfdItens.unidade),
    db.select({ texto: catalogoItens.unidade, n: sql<number>`COUNT(*)` }).from(catalogoItens).groupBy(catalogoItens.unidade),
  ]);
  return [
    ...doDfd.map((r) => ({ texto: r.texto, dfd: Number(r.n), catalogo: 0 })),
    ...doCatalogo.map((r) => ({ texto: r.texto, dfd: 0, catalogo: Number(r.n) })),
  ];
}

/**
 * DESCRIÇÕES DISTINTAS dos itens (descrição + unidade) com quantos itens as usam e o valor dos de DFD — a prévia da
 * classificação automática. Mesmo escopo de `usoDasUnidades`. Agregado no banco (a mesma descrição repetida em N DFDs
 * vem uma vez só). O item SEM descrição também conta (vem com descrição vazia — a unidade ainda o classifica): os
 * totais da tela batem com os itens da Mesa.
 */
export async function descricoesDosItens(reparticaoId?: number): Promise<DescricaoItem[]> {
  const db = getDb();
  const [doDfd, doCatalogo] = await Promise.all([
    db
      .select({
        descricao: dfdItens.descricao,
        unidade: dfdItens.unidade,
        n: sql<number>`COUNT(*)`,
        valor: sql<number>`COALESCE(SUM(${dfdItens.valorTotal}), 0)`,
      })
      .from(dfdItens)
      .innerJoin(dfds, eq(dfdItens.dfdId, dfds.id))
      .where(reparticaoId ? eq(dfds.reparticaoId, reparticaoId) : undefined)
      .groupBy(dfdItens.descricao, dfdItens.unidade),
    db
      .select({ descricao: catalogoItens.descricao, unidade: catalogoItens.unidade, n: sql<number>`COUNT(*)` })
      .from(catalogoItens)
      .groupBy(catalogoItens.descricao, catalogoItens.unidade),
  ]);
  const porChave = new Map<string, DescricaoItem>();
  const somar = (descricao: string | null, unidade: string | null, dfd: number, catalogo: number, valor: number) => {
    const d = (descricao ?? "").trim();
    const k = `${d}\u0000${unidade ?? ""}`;
    const a = porChave.get(k) ?? { descricao: d, unidade: unidade ?? null, dfd: 0, catalogo: 0, valor: 0 };
    a.dfd += dfd;
    a.catalogo += catalogo;
    a.valor += valor;
    porChave.set(k, a);
  };
  for (const r of doDfd) somar(r.descricao, r.unidade, Number(r.n), 0, Number(r.valor) || 0);
  for (const r of doCatalogo) somar(r.descricao, r.unidade, 0, Number(r.n), 0);
  return [...porChave.values()];
}
