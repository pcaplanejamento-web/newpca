import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { catalogoItens, catalogos } from "@/db/schema";
import { type CatalogoItemImport, normalizarTipos } from "./catalogo-validation";
import { getDb } from "./db";

/**
 * Acesso a dados do CATÁLOGO de produtos. Base GLOBAL isolada (sem repartição/grupo,
 * sem FK p/ PCA/DFD). Só escopo de request (usa `getDb`). O `codigo` é único GLOBAL:
 * o import barra conflitos antes de gravar (ver `codigosEmConflito`).
 */

// catalogo_itens = 7 colunas vinculadas por linha → 14×7 = 98 (< limite de 100 do D1).
const ROWS_PER_STMT = 14;
// Máximo de valores num `inArray` (fica < 100 do D1).
const IN_CHUNK = 90;

function parseTipos(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? normalizarTipos(v.map(String)) : [];
  } catch {
    return [];
  }
}

export type CatalogoResumo = {
  id: number;
  nome: string;
  descricao: string | null;
  tiposPadrao: string[];
  totalItens: number;
  atualizadoEm: string | null;
};

/** Lista os catálogos (sem itens) — o mais recente primeiro. */
export async function listarCatalogos(): Promise<CatalogoResumo[]> {
  const linhas = await getDb()
    .select({
      id: catalogos.id,
      nome: catalogos.nome,
      descricao: catalogos.descricao,
      tiposPadrao: catalogos.tiposPadrao,
      totalItens: catalogos.totalItens,
      atualizadoEm: catalogos.atualizadoEm,
    })
    .from(catalogos)
    .orderBy(desc(catalogos.atualizadoEm), desc(catalogos.id));
  return linhas.map((l) => ({ ...l, tiposPadrao: parseTipos(l.tiposPadrao) }));
}

export type CatalogoItemRow = {
  id: number;
  catalogoId: number;
  codigo: string;
  codigoRaw: string | null;
  descricao: string;
  unidade: string | null;
  sequencial: number | null;
  tipos: string[];
};

/** Itens na ordem do arquivo (`sequencial`). Sem `catalogoId` = de TODOS os catálogos
 * (a tela carrega tudo e agrupa no cliente, como o dashboard). */
export async function getCatalogoItens(catalogoId?: number): Promise<CatalogoItemRow[]> {
  const db = getDb();
  const cols = {
    id: catalogoItens.id,
    catalogoId: catalogoItens.catalogoId,
    codigo: catalogoItens.codigo,
    codigoRaw: catalogoItens.codigoRaw,
    descricao: catalogoItens.descricao,
    unidade: catalogoItens.unidade,
    sequencial: catalogoItens.sequencial,
    tipos: catalogoItens.tipos,
  };
  const linhas =
    catalogoId != null
      ? await db
          .select(cols)
          .from(catalogoItens)
          .where(eq(catalogoItens.catalogoId, catalogoId))
          .orderBy(asc(catalogoItens.sequencial), asc(catalogoItens.id))
      : await db
          .select(cols)
          .from(catalogoItens)
          .orderBy(asc(catalogoItens.catalogoId), asc(catalogoItens.sequencial), asc(catalogoItens.id));
  return linhas.map((l) => ({ ...l, tipos: parseTipos(l.tipos) }));
}

/** Um catálogo pelo id (`{id,nome}`) — para validar o alvo de uma atualização. `null` se não existe. */
export async function getCatalogo(id: number): Promise<{ id: number; nome: string } | null> {
  const [c] = await getDb().select({ id: catalogos.id, nome: catalogos.nome }).from(catalogos).where(eq(catalogos.id, id)).limit(1);
  return c ?? null;
}

/**
 * Códigos que JÁ existem em OUTRO catálogo (conflito da unicidade global). Recebe os
 * códigos do arquivo e o catálogo-alvo (excluído da checagem numa atualização).
 * Devolve só os conflitantes: `[{codigo, catalogoNome}]`.
 */
export async function codigosEmConflito(
  codigos: string[],
  excetoCatalogoId: number | null,
): Promise<{ codigo: string; catalogoNome: string }[]> {
  const uniq = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))];
  if (uniq.length === 0) return [];
  const out: { codigo: string; catalogoNome: string }[] = [];
  for (let i = 0; i < uniq.length; i += IN_CHUNK) {
    const lote = uniq.slice(i, i + IN_CHUNK);
    const cond = excetoCatalogoId
      ? and(inArray(catalogoItens.codigo, lote), ne(catalogoItens.catalogoId, excetoCatalogoId))
      : inArray(catalogoItens.codigo, lote);
    const linhas = await getDb()
      .select({ codigo: catalogoItens.codigo, catalogoNome: catalogos.nome })
      .from(catalogoItens)
      .innerJoin(catalogos, eq(catalogoItens.catalogoId, catalogos.id))
      .where(cond);
    out.push(...linhas);
  }
  return out;
}

/** Cria um catálogo novo; devolve o id. */
export async function criarCatalogo(nome: string, tiposPadrao: string[]): Promise<number> {
  const [c] = await getDb()
    .insert(catalogos)
    .values({ nome, tiposPadrao: JSON.stringify(normalizarTipos(tiposPadrao)) })
    .returning({ id: catalogos.id });
  return c.id;
}

/** Edita um catálogo gravado (nome e/ou tipos padrão). */
export async function atualizarCatalogo(id: number, campos: { nome?: string; tiposPadrao?: string[] }): Promise<void> {
  const set: Record<string, unknown> = { atualizadoEm: sql`(CURRENT_TIMESTAMP)` };
  if (campos.nome !== undefined) set.nome = campos.nome;
  if (campos.tiposPadrao !== undefined) set.tiposPadrao = JSON.stringify(normalizarTipos(campos.tiposPadrao));
  await getDb().update(catalogos).set(set).where(eq(catalogos.id, id));
}

/** Exclui um catálogo E seus itens (explícito + cascade de backstop), atômico. */
export async function excluirCatalogo(id: number): Promise<void> {
  const db = getDb();
  await db.batch([
    db.delete(catalogoItens).where(eq(catalogoItens.catalogoId, id)),
    db.delete(catalogos).where(eq(catalogos.id, id)),
  ]);
}

// biome-ignore lint/suspicious/noExplicitAny: os tipos encadeados do query-builder do Drizzle p/ db.batch() são inviáveis de anotar.
function upsertStmts(db: ReturnType<typeof getDb>, catalogoId: number, itens: CatalogoItemImport[], tiposJson: string): any[] {
  const stmts = [];
  for (let i = 0; i < itens.length; i += ROWS_PER_STMT) {
    stmts.push(
      db
        .insert(catalogoItens)
        .values(
          itens.slice(i, i + ROWS_PER_STMT).map((it) => ({
            catalogoId,
            codigo: it.codigo,
            codigoRaw: it.codigoRaw ?? null,
            descricao: it.descricao,
            unidade: it.unidade ?? null,
            sequencial: it.sequencial ?? null,
            tipos: tiposJson, // só p/ item NOVO; no update abaixo NÃO tocamos em `tipos` (preserva a config)
          })),
        )
        .onConflictDoUpdate({
          target: catalogoItens.codigo,
          set: {
            descricao: sql`excluded.descricao`,
            unidade: sql`excluded.unidade`,
            sequencial: sql`excluded.sequencial`,
            codigoRaw: sql`excluded.codigo_raw`,
            atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
          },
        }),
    );
  }
  return stmts;
}

/**
 * Grava/atualiza itens de um catálogo por CÓDIGO (merge PRESERVANDO os `tipos` já
 * configurados): item novo entra com o `tipos_padrao` do catálogo; item que já existe
 * tem só descrição/unidade/sequencial atualizados. NUNCA apaga ausentes. Recalcula o
 * total. Pré-condição: os códigos não conflitam com OUTRO catálogo (checado antes).
 */
export async function upsertCatalogoItens(catalogoId: number, itens: CatalogoItemImport[]): Promise<{ inserted: number }> {
  if (itens.length === 0) return { inserted: 0 };
  const db = getDb();
  const [cat] = await db.select({ tiposPadrao: catalogos.tiposPadrao }).from(catalogos).where(eq(catalogos.id, catalogoId)).limit(1);
  const tiposJson = JSON.stringify(parseTipos(cat?.tiposPadrao));
  const stmts = upsertStmts(db, catalogoId, itens, tiposJson);
  stmts.push(
    db
      .update(catalogos)
      .set({
        totalItens: sql`(SELECT COUNT(*) FROM catalogo_itens WHERE catalogo_id = ${catalogoId})`,
        atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(catalogos.id, catalogoId)),
  );
  // biome-ignore lint/suspicious/noExplicitAny: a tupla exigida por db.batch() do Drizzle é inviável de anotar.
  await db.batch(stmts as [any, ...any[]]);
  return { inserted: itens.length };
}

/** Define os `tipos` de um conjunto de itens (mesmo valor p/ todos) — por item ou em massa. */
export async function definirTiposItens(ids: number[], tipos: string[]): Promise<void> {
  const uniq = [...new Set(ids)].filter((n) => Number.isInteger(n));
  if (uniq.length === 0) return;
  const json = JSON.stringify(normalizarTipos(tipos));
  for (let i = 0; i < uniq.length; i += IN_CHUNK) {
    await getDb()
      .update(catalogoItens)
      .set({ tipos: json, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
      .where(inArray(catalogoItens.id, uniq.slice(i, i + IN_CHUNK)));
  }
}
