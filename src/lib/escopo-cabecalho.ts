import { eq, sql } from "drizzle-orm";
import { configuracoes } from "@/db/schema";
import type { UsuarioSessao } from "./auth";
import { getDb } from "./db";
import { type ConfigEscopo, lerConfigEscopo, type ModuloEscopo } from "./escopo-cabecalho-core";
import { type FiltroId, filtroDoEscopo, idDoFiltro } from "./escopo-unidades-core";
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
  id: FiltroId;
  /** O código (sigla) da unidade que filtra — `null` sem filtro. */
  sigla: string | null;
  /** O nome, para o selo/aviso da tela. */
  nome: string | null;
  cfg: ConfigEscopo;
};

/** A TELA de cada módulo (no grupo de "unidade de cadastro", a tela marcada "todas" vê todas as unidades); a Automação
 * mexe em protocolos — segue a Mesa. */
const TELA_DO_MODULO: Record<ModuloEscopo, string> = {
  pca: "pca",
  orcamento: "orcamento",
  catalogo: "catalogo",
  tarefas: "tarefas",
  calendario: "calendario",
  automacao: "dfd",
  empenhos: "empenhos",
};

/** A unidade do CABEÇALHO que filtra um módulo (a config do ADM decide se o módulo obedece). */
export async function unidadeDoModulo(
  modulo: ModuloEscopo,
  u?: UsuarioSessao | null,
  grupoAtivo?: GrupoResumo | null,
  /** A aba da tela (a fonte dos dados dela pode ser a soma de todas as unidades — Grupos → "Fonte dos dados"). */
  aba?: string,
): Promise<UnidadeDoModulo> {
  const [un, cfg] = await Promise.all([unidadesDaSessao(u, grupoAtivo, TELA_DO_MODULO[modulo], aba), getConfigEscopo()]);
  // Módulo que não obedece ao cabeçalho = as unidades que a pessoa ACESSA (nunca todas para quem não tem acesso a todas).
  const id = cfg.modulos[modulo] ? idDoFiltro(un.filtro) : idDoFiltro(filtroDoEscopo(un.escopo));
  const ativa = typeof id === "number" ? un.ativa : null;
  return { id, sigla: ativa?.codigo ?? null, nome: ativa?.nome ?? null, cfg };
}

/**
 * A unidade da MESA DO PCA: as unidades da tela MESA (no grupo de "unidade de cadastro" com a Mesa em "todas", todas — a
 * pessoa troca no cabeçalho) e a escolha do ADM de o PCA obedecer ao cabeçalho. Sem escolha, a unidade do cadastro.
 */
export async function unidadeDaMesaDoPca(u?: UsuarioSessao | null): Promise<FiltroId> {
  const [un, cfg] = await Promise.all([unidadesDaSessao(u, undefined, "pca", "mesa"), getConfigEscopo()]);
  return cfg.modulos.pca ? idDoFiltro(un.filtro) : idDoFiltro(filtroDoEscopo(un.escopo));
}

/** O Catálogo no modo "usados": a unidade do cabeçalho (só os itens/históricos cujo código ela usa); `todos` = sem filtro. */
export async function unidadeDoCatalogo(): Promise<FiltroId> {
  const r = await unidadeDoModulo("catalogo");
  return r.cfg.catalogo === "usados" ? r.id : null;
}
