import { and, asc, desc, eq, inArray, like, ne, sql } from "drizzle-orm";
import { catalogoItens, catalogos } from "@/db/schema";
import { type CatalogoRef, type ConferenciaItem, conferirItem } from "./catalogo-conferencia";
import { comCatalogo, resolverRemocao } from "./catalogo-membros";
import { type CatalogoItemImport, normalizarTipos } from "./catalogo-validation";
import { getDb } from "./db";
import { normalizarCodigo } from "./parse-catalogo-comum";

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

/** Parse de um JSON `number[]` (ex.: `catalogos_extra`) — tolerante a lixo. */
function parseIds(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n)))] : [];
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
  catalogoId: number; // catálogo de ORIGEM (home)
  codigo: string;
  codigoRaw: string | null;
  descricao: string;
  unidade: string | null;
  sequencial: number | null;
  tipos: string[];
  catalogosExtra: number[]; // catálogos ADICIONAIS (item compartilhado); pertence a [catalogoId, ...este]
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
    catalogosExtra: catalogoItens.catalogosExtra,
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
  return linhas.map((l) => ({ ...l, tipos: parseTipos(l.tipos), catalogosExtra: parseIds(l.catalogosExtra) }));
}

/** Um catálogo pelo id (`{id,nome}`) — para validar o alvo de uma atualização. `null` se não existe. */
export async function getCatalogo(id: number): Promise<{ id: number; nome: string } | null> {
  const [c] = await getDb().select({ id: catalogos.id, nome: catalogos.nome }).from(catalogos).where(eq(catalogos.id, id)).limit(1);
  return c ?? null;
}

/** Um conflito de código (item já cadastrado em OUTRO catálogo) — com os dados do item
 * EXISTENTE, p/ o cliente comparar (idêntico × divergente) e mesclar tipos. */
export type ConflitoCatalogo = {
  codigo: string;
  id: number;
  catalogoId: number;
  catalogoNome: string;
  descricao: string;
  unidade: string | null;
  tipos: string[];
};

/**
 * Códigos que JÁ existem em OUTRO catálogo (conflito da unicidade global). Recebe os
 * códigos do arquivo e o catálogo-alvo (excluído da checagem numa atualização). Devolve o
 * item EXISTENTE de cada conflito (id/catálogo/descrição/unidade/tipos) — o gate do import
 * usa só código+nome; o preview compara os dados e calcula a união de tipos.
 */
export async function codigosEmConflito(
  codigos: string[],
  excetoCatalogoId: number | null,
): Promise<ConflitoCatalogo[]> {
  const uniq = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))];
  if (uniq.length === 0) return [];
  const out: ConflitoCatalogo[] = [];
  for (let i = 0; i < uniq.length; i += IN_CHUNK) {
    const lote = uniq.slice(i, i + IN_CHUNK);
    const cond = excetoCatalogoId
      ? and(inArray(catalogoItens.codigo, lote), ne(catalogoItens.catalogoId, excetoCatalogoId))
      : inArray(catalogoItens.codigo, lote);
    const linhas = await getDb()
      .select({
        codigo: catalogoItens.codigo,
        id: catalogoItens.id,
        catalogoId: catalogoItens.catalogoId,
        catalogoNome: catalogos.nome,
        descricao: catalogoItens.descricao,
        unidade: catalogoItens.unidade,
        tipos: catalogoItens.tipos,
      })
      .from(catalogoItens)
      .innerJoin(catalogos, eq(catalogoItens.catalogoId, catalogos.id))
      .where(cond);
    out.push(...linhas.map((l) => ({ ...l, tipos: parseTipos(l.tipos) })));
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

/**
 * Exclui um catálogo — PRESERVANDO os itens COMPARTILHADOS (que estão em outros catálogos).
 * Item cuja origem era este catálogo mas está compartilhado → **reatribui a origem** a um
 * dos outros; item compartilhado PARA este catálogo → remove só a associação; item cujo
 * único catálogo era este → apagado (delete por origem + cascade). Recalcula os totais das
 * origens reatribuídas. Atômico (`db.batch`).
 */
export async function excluirCatalogo(id: number): Promise<void> {
  const db = getDb();
  // Só os itens COMPARTILHADOS (extras ≠ []) podem ser afetados — os demais caem no delete.
  const compartilhados = await db
    .select({ id: catalogoItens.id, catalogoId: catalogoItens.catalogoId, catalogosExtra: catalogoItens.catalogosExtra })
    .from(catalogoItens)
    .where(ne(catalogoItens.catalogosExtra, "[]"));

  // biome-ignore lint/suspicious/noExplicitAny: a tupla exigida por db.batch() do Drizzle é inviável de anotar.
  const stmts: any[] = [];
  const origensReatribuidas = new Set<number>();
  for (const it of compartilhados) {
    const extra = parseIds(it.catalogosExtra);
    if (it.catalogoId === id) {
      // Origem aqui + compartilhado → reatribui a origem (o item sobrevive nos outros).
      const r = resolverRemocao(id, extra, id);
      if (r === "excluir") continue; // sem outros catálogos → cai no delete por origem
      stmts.push(
        db.update(catalogoItens).set({ catalogoId: r.origem, catalogosExtra: JSON.stringify(r.extra), atualizadoEm: sql`(CURRENT_TIMESTAMP)` }).where(eq(catalogoItens.id, it.id)),
      );
      origensReatribuidas.add(r.origem);
    } else if (extra.includes(id)) {
      // Origem em outro catálogo, compartilhado PARA este → remove só a associação.
      stmts.push(
        db.update(catalogoItens).set({ catalogosExtra: JSON.stringify(extra.filter((c) => c !== id)), atualizadoEm: sql`(CURRENT_TIMESTAMP)` }).where(eq(catalogoItens.id, it.id)),
      );
    }
  }
  // Apaga os itens cuja ORIGEM ainda é este catálogo (só-home; reatribuídos já mudaram acima).
  stmts.push(db.delete(catalogoItens).where(eq(catalogoItens.catalogoId, id)));
  stmts.push(db.delete(catalogos).where(eq(catalogos.id, id)));
  for (const cid of origensReatribuidas) {
    stmts.push(
      db.update(catalogos).set({ totalItens: sql`(SELECT COUNT(*) FROM catalogo_itens WHERE catalogo_id = ${cid})`, atualizadoEm: sql`(CURRENT_TIMESTAMP)` }).where(eq(catalogos.id, cid)),
    );
  }
  // biome-ignore lint/suspicious/noExplicitAny: a tupla exigida por db.batch() do Drizzle é inviável de anotar.
  await db.batch(stmts as [any, ...any[]]);
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
 *
 * `opts.excluirItens`: ids de itens de OUTROS catálogos a remover ANTES do upsert — resolve
 * os conflitos "substituir" (o usuário optou por excluir o existente e importar o novo).
 * Tudo num único `db.batch` (atômico, sem janela de perda); recalcula o total do alvo E dos
 * catálogos de origem dos excluídos.
 */
export async function upsertCatalogoItens(
  catalogoId: number,
  itens: CatalogoItemImport[],
  opts?: { excluirItens?: number[] },
): Promise<{ inserted: number }> {
  const excluir = [...new Set(opts?.excluirItens ?? [])].filter((n) => Number.isInteger(n));
  if (itens.length === 0 && excluir.length === 0) return { inserted: 0 };
  const db = getDb();

  // Catálogos de origem dos itens que serão excluídos (p/ recalcular os totais deles também).
  let origem: number[] = [];
  if (excluir.length > 0) {
    const linhas = await db.select({ catalogoId: catalogoItens.catalogoId }).from(catalogoItens).where(inArray(catalogoItens.id, excluir));
    origem = [...new Set(linhas.map((l) => l.catalogoId))];
  }

  const [cat] = await db.select({ tiposPadrao: catalogos.tiposPadrao }).from(catalogos).where(eq(catalogos.id, catalogoId)).limit(1);
  const tiposJson = JSON.stringify(parseTipos(cat?.tiposPadrao));

  // biome-ignore lint/suspicious/noExplicitAny: a tupla exigida por db.batch() do Drizzle é inviável de anotar.
  const stmts: any[] = [];
  // 1) Remove os "substituídos" (libera o código global para o catálogo alvo).
  for (let i = 0; i < excluir.length; i += IN_CHUNK) {
    stmts.push(db.delete(catalogoItens).where(inArray(catalogoItens.id, excluir.slice(i, i + IN_CHUNK))));
  }
  // 2) Grava os novos (merge por código, preservando tipos).
  stmts.push(...upsertStmts(db, catalogoId, itens, tiposJson));
  // 3) Recalcula os totais: alvo + catálogos de origem dos excluídos.
  for (const cid of [...new Set([catalogoId, ...origem])]) {
    stmts.push(
      db
        .update(catalogos)
        .set({
          totalItens: sql`(SELECT COUNT(*) FROM catalogo_itens WHERE catalogo_id = ${cid})`,
          atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
        })
        .where(eq(catalogos.id, cid)),
    );
  }
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

/** Edita os campos de UM item (descrição/unidade/tipos) — o código é imutável (chave global). */
export async function atualizarCatalogoItem(
  id: number,
  campos: { descricao?: string; unidade?: string | null; tipos?: string[] },
): Promise<void> {
  const set: Record<string, unknown> = { atualizadoEm: sql`(CURRENT_TIMESTAMP)` };
  if (campos.descricao !== undefined) set.descricao = campos.descricao;
  if (campos.unidade !== undefined) set.unidade = campos.unidade || null;
  if (campos.tipos !== undefined) set.tipos = JSON.stringify(normalizarTipos(campos.tipos));
  await getDb().update(catalogoItens).set(set).where(eq(catalogoItens.id, id));
}

/**
 * Cria UM item manualmente num catálogo. O código é salvo SÓ com dígitos (`codigo_raw =
 * codigo`) e é a chave ÚNICA GLOBAL — a rota confere o conflito ANTES (422 se já existir em
 * qualquer catálogo). Recalcula o total do catálogo. Devolve o id do item.
 */
export async function criarCatalogoItem(
  catalogoId: number,
  campos: { codigo: string; descricao: string; unidade: string | null; tipos: string[] },
): Promise<{ id: number }> {
  const db = getDb();
  const codigo = normalizarCodigo(campos.codigo);
  const [item] = await db
    .insert(catalogoItens)
    .values({
      catalogoId,
      codigo,
      codigoRaw: codigo,
      descricao: campos.descricao,
      unidade: campos.unidade,
      sequencial: null,
      tipos: JSON.stringify(normalizarTipos(campos.tipos)),
    })
    .returning({ id: catalogoItens.id });
  await db
    .update(catalogos)
    .set({ totalItens: sql`(SELECT COUNT(*) FROM catalogo_itens WHERE catalogo_id = ${catalogoId})`, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(catalogos.id, catalogoId));
  return { id: item.id };
}

/** Exclui UM item e recalcula o total do seu catálogo. `null`-safe se o item não existir. */
export async function excluirCatalogoItem(id: number): Promise<void> {
  const db = getDb();
  const [item] = await db.select({ catalogoId: catalogoItens.catalogoId }).from(catalogoItens).where(eq(catalogoItens.id, id)).limit(1);
  if (!item) return;
  await db.delete(catalogoItens).where(eq(catalogoItens.id, id));
  await db
    .update(catalogos)
    .set({ totalItens: sql`(SELECT COUNT(*) FROM catalogo_itens WHERE catalogo_id = ${item.catalogoId})`, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(catalogos.id, item.catalogoId));
}

/**
 * Une (UNIÃO) os `tiposNovos` aos tipos já existentes de cada item — o caso "item idêntico
 * importado com tipo novo": o item EXISTENTE ganha os tipos, sem duplicar (`normalizarTipos`
 * garante ordem canônica + sem repetido). Só grava quem realmente muda.
 */
export async function mesclarTiposEmItens(ids: number[], tiposNovos: string[]): Promise<void> {
  const novos = normalizarTipos(tiposNovos);
  const uniq = [...new Set(ids)].filter((n) => Number.isInteger(n));
  if (uniq.length === 0 || novos.length === 0) return;
  const db = getDb();
  for (let i = 0; i < uniq.length; i += IN_CHUNK) {
    const linhas = await db.select({ id: catalogoItens.id, tipos: catalogoItens.tipos }).from(catalogoItens).where(inArray(catalogoItens.id, uniq.slice(i, i + IN_CHUNK)));
    for (const l of linhas) {
      const atuais = parseTipos(l.tipos);
      const uniao = normalizarTipos([...atuais, ...novos]);
      if (uniao.length !== atuais.length)
        await db.update(catalogoItens).set({ tipos: JSON.stringify(uniao), atualizadoEm: sql`(CURRENT_TIMESTAMP)` }).where(eq(catalogoItens.id, l.id));
    }
  }
}

/**
 * COMPARTILHA itens EXISTENTES (idênticos) num catálogo destino: adiciona o destino aos
 * `catalogos_extra` de cada item (sem duplicar a linha) e UNE os tipos padrão do destino aos
 * tipos do item (herda os tipos dos dois lugares). O mesmo item passa a constar em vários
 * catálogos. O total do destino é contado no CLIENTE (pertencimento) — não altera `total_itens`.
 * `tiposPadrao` vem do próprio catálogo destino (fonte única).
 */
export async function compartilharItensNoCatalogo(catalogoId: number, itemIds: number[]): Promise<void> {
  const uniq = [...new Set(itemIds)].filter((n) => Number.isInteger(n));
  if (uniq.length === 0) return;
  const db = getDb();
  const [cat] = await db.select({ tiposPadrao: catalogos.tiposPadrao }).from(catalogos).where(eq(catalogos.id, catalogoId)).limit(1);
  if (!cat) return;
  const novos = parseTipos(cat.tiposPadrao);
  for (let i = 0; i < uniq.length; i += IN_CHUNK) {
    const linhas = await db
      .select({ id: catalogoItens.id, catalogoId: catalogoItens.catalogoId, catalogosExtra: catalogoItens.catalogosExtra, tipos: catalogoItens.tipos })
      .from(catalogoItens)
      .where(inArray(catalogoItens.id, uniq.slice(i, i + IN_CHUNK)));
    for (const l of linhas) {
      const extra = comCatalogo(l.catalogoId, parseIds(l.catalogosExtra), catalogoId);
      const uniao = normalizarTipos([...parseTipos(l.tipos), ...novos]);
      await db
        .update(catalogoItens)
        .set({ catalogosExtra: JSON.stringify(extra), tipos: JSON.stringify(uniao), atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
        .where(eq(catalogoItens.id, l.id));
    }
  }
}

/**
 * Remove UM item de UM catálogo (desfaz o compartilhamento). Se o catálogo era a ORIGEM e o
 * item está em OUTROS, REATRIBUI a origem; se era o ÚNICO catálogo, EXCLUI o item. Recalcula
 * os totais das origens afetadas. `null`-safe se o item não existir.
 */
export async function removerItemDoCatalogo(itemId: number, catalogoId: number): Promise<void> {
  const db = getDb();
  const [item] = await db
    .select({ catalogoId: catalogoItens.catalogoId, catalogosExtra: catalogoItens.catalogosExtra })
    .from(catalogoItens)
    .where(eq(catalogoItens.id, itemId))
    .limit(1);
  if (!item) return;
  const r = resolverRemocao(item.catalogoId, parseIds(item.catalogosExtra), catalogoId);
  if (r === "excluir") {
    await excluirCatalogoItem(itemId);
    return;
  }
  await db
    .update(catalogoItens)
    .set({ catalogoId: r.origem, catalogosExtra: JSON.stringify(r.extra), atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(catalogoItens.id, itemId));
  for (const cid of [...new Set([item.catalogoId, r.origem])]) {
    await db
      .update(catalogos)
      .set({ totalItens: sql`(SELECT COUNT(*) FROM catalogo_itens WHERE catalogo_id = ${cid})`, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
      .where(eq(catalogos.id, cid));
  }
}

// ---- Conferência dos itens do DFD contra o catálogo (referência de padronização) ----

const LIMITE_SUGESTOES = 25; // nº de itens não catalogados que ganham sugestão por semelhança (limita custo)
const CAND_LIMIT = 25; // candidatos por item não catalogado

const COLS_REF = {
  codigo: catalogoItens.codigo,
  codigoRaw: catalogoItens.codigoRaw,
  descricao: catalogoItens.descricao,
  unidade: catalogoItens.unidade,
  tipos: catalogoItens.tipos,
  catalogoNome: catalogos.nome,
};
function toRef(l: {
  codigo: string;
  codigoRaw: string | null;
  descricao: string;
  unidade: string | null;
  tipos: string;
  catalogoNome: string;
}): CatalogoRef {
  return { codigo: l.codigo, codigoRaw: l.codigoRaw, descricao: l.descricao, unidade: l.unidade, tipos: parseTipos(l.tipos), catalogoNome: l.catalogoNome };
}
/** Token mais distintivo (mais longo, ≥4 chars) da descrição — p/ o LIKE de candidatos. */
function tokenBusca(descricao: string | null): string | null {
  const toks = (descricao ?? "").split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 4);
  toks.sort((a, b) => b.length - a.length);
  return toks[0] ?? null;
}

/**
 * Confere os itens de UM DFD contra o catálogo. Busca só as entradas dos CÓDIGOS do DFD
 * (chunked `inArray`, escalável — NÃO carrega o catálogo inteiro) e, para os não
 * catalogados, propõe o item mais semelhante por descrição (best-effort, limitado).
 * Devolve o veredito por CÓDIGO normalizado. `dfdTipo` = curto (DFD-S/R/O/E) ou null.
 * Guard: sem catálogo cadastrado ⇒ nenhum veredito (não é falta).
 */
export async function conferirItensNoCatalogo(
  itens: { codigo: string | null; descricao: string | null; unidade: string | null }[],
  dfdTipo: string | null,
): Promise<Map<string, ConferenciaItem>> {
  const out = new Map<string, ConferenciaItem>();
  const codigos = [...new Set(itens.map((i) => normalizarCodigo(i.codigo)).filter(Boolean))];
  if (codigos.length === 0) return out;
  const db = getDb();

  // Sem catálogo cadastrado ⇒ sem checagem (evita marcar tudo como "fora do catálogo").
  const [tot] = await db.select({ n: sql<number>`count(*)` }).from(catalogoItens);
  if (Number(tot?.n ?? 0) === 0) return out;

  // Entradas do catálogo apenas dos códigos do DFD.
  const index = new Map<string, CatalogoRef>();
  for (let i = 0; i < codigos.length; i += IN_CHUNK) {
    const linhas = await db
      .select(COLS_REF)
      .from(catalogoItens)
      .innerJoin(catalogos, eq(catalogoItens.catalogoId, catalogos.id))
      .where(inArray(catalogoItens.codigo, codigos.slice(i, i + IN_CHUNK)));
    for (const l of linhas) index.set(l.codigo, toRef(l));
  }

  // Candidatos por semelhança — só p/ não catalogados, limitados por custo.
  const candPorCodigo = new Map<string, CatalogoRef[]>();
  let feitas = 0;
  for (const it of itens) {
    const c = normalizarCodigo(it.codigo);
    if (!c || index.has(c) || candPorCodigo.has(c)) continue;
    const tok = feitas < LIMITE_SUGESTOES ? tokenBusca(it.descricao) : null;
    if (!tok) {
      candPorCodigo.set(c, []);
      continue;
    }
    feitas++;
    const linhas = await db
      .select(COLS_REF)
      .from(catalogoItens)
      .innerJoin(catalogos, eq(catalogoItens.catalogoId, catalogos.id))
      .where(like(catalogoItens.descricao, `%${tok}%`))
      .limit(CAND_LIMIT);
    candPorCodigo.set(c, linhas.map(toRef));
  }

  for (const it of itens) {
    const c = normalizarCodigo(it.codigo);
    if (!c || out.has(c)) continue;
    const entry = index.get(c) ?? null;
    out.set(c, conferirItem(it, entry, dfdTipo, entry ? [] : (candPorCodigo.get(c) ?? [])));
  }
  return out;
}
