import { eq, sql } from "drizzle-orm";
import { configuracoes } from "@/db/schema";
import type { UsuarioSessao } from "./auth";
import { getDb } from "./db";
import { type ConfigEscopo, filtroDoModulo, lerConfigEscopo, type ModuloEscopo } from "./escopo-cabecalho-core";
import { idDoFiltro } from "./escopo-unidades-core";
import { type GrupoResumo, unidadesDaSessao } from "./grupos";
import { lerBlobConfiguracoes } from "./integracoes";

// O FILTRO DA UNIDADE DO CABEÇALHO no banco (blob `configuracoes` id=1, chave `escopoCabecalho` — cache 60 s, fail-safe =
// o padrão: tudo obedece) + o ponto ÚNICO que dá, a cada módulo, a unidade que filtra.
let cache: { at: number; dados: ConfigEscopo } | null = null;
const TTL = 60_000;

export async function getConfigEscopo(opcoes: { fresco?: boolean } = {}): Promise<ConfigEscopo> {
  if (!opcoes.fresco && cache && Date.now() - cache.at < TTL) return cache.dados;
  try {
    const dados = lerConfigEscopo((await lerBlobConfiguracoes()).escopoCabecalho);
    cache = { at: Date.now(), dados };
    return dados;
  } catch {
    return cache?.dados ?? lerConfigEscopo(undefined);
  }
}

export async function gravarConfigEscopo(cfg: ConfigEscopo, usuarioId: number): Promise<ConfigEscopo> {
  const blob = await lerBlobConfiguracoes();
  const valor = lerConfigEscopo(cfg);
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify({ ...blob, escopoCabecalho: valor }), atualizadoPor: usuarioId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  cache = null;
  return valor;
}

export type UnidadeDoModulo = {
  /** `number` = só esta unidade; `null` = sem filtro; `false` = nenhuma (vazio). */
  id: number | null | false;
  /** O código (sigla) da unidade que filtra — `null` sem filtro. */
  sigla: string | null;
  /** O nome, para o selo/aviso da tela. */
  nome: string | null;
  cfg: ConfigEscopo;
};

/** A unidade do CABEÇALHO que filtra um módulo (a config do ADM decide se o módulo obedece). */
export async function unidadeDoModulo(modulo: ModuloEscopo, u?: UsuarioSessao | null, grupoAtivo?: GrupoResumo | null): Promise<UnidadeDoModulo> {
  const [un, cfg] = await Promise.all([unidadesDaSessao(u, grupoAtivo), getConfigEscopo()]);
  const id = filtroDoModulo(cfg, modulo, idDoFiltro(un.filtro));
  const ativa = typeof id === "number" ? un.ativa : null;
  return { id, sigla: ativa?.codigo ?? null, nome: ativa?.nome ?? null, cfg };
}

/** O Catálogo no modo "usados": a unidade do cabeçalho (só os itens/históricos cujo código ela usa); `todos` = sem filtro. */
export async function unidadeDoCatalogo(): Promise<number | false | null> {
  const r = await unidadeDoModulo("catalogo");
  return r.cfg.catalogo === "usados" ? r.id : null;
}
