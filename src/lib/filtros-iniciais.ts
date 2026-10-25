import { eq, sql } from "drizzle-orm";
import { configuracoes } from "@/db/schema";
import { getDb } from "./db";
import { REGRAS_FILTROS_EXEC } from "./execucao-dash-core";
import { type ChaveFiltrosIniciais, coerceEstado, type EstadoFiltros, lerFiltrosIniciais, type RegrasFiltros } from "./filtros-visao-core";
import { lerBlobConfiguracoes } from "./integracoes";

// O ESTADO INICIAL dos filtros de cada lugar, definido pelo ADM (blob `configuracoes` id=1, chave `filtrosIniciais` —
// cache 60 s; falha ao ler = o padrão do sistema, sem filtro). Cada estado é saneado pelas regras do lugar.
export const REGRAS_FILTROS: Record<ChaveFiltrosIniciais, RegrasFiltros> = { execucao: REGRAS_FILTROS_EXEC };

type Iniciais = Partial<Record<ChaveFiltrosIniciais, EstadoFiltros>>;
let cache: { at: number; dados: Iniciais } | null = null;
const TTL = 60_000;

export async function getFiltrosIniciais(opcoes: { fresco?: boolean } = {}): Promise<Iniciais> {
  if (!opcoes.fresco && cache && Date.now() - cache.at < TTL) return cache.dados;
  try {
    const dados = lerFiltrosIniciais((await lerBlobConfiguracoes()).filtrosIniciais, REGRAS_FILTROS);
    cache = { at: Date.now(), dados };
    return dados;
  } catch {
    return cache?.dados ?? {};
  }
}

/** Grava (ou apaga, com `null`) o estado inicial de UM lugar; os demais lugares e as chaves irmãs do blob ficam. */
export async function gravarFiltroInicial(chave: ChaveFiltrosIniciais, estado: unknown, usuarioId: number): Promise<EstadoFiltros | null> {
  const blob = await lerBlobConfiguracoes();
  const atuais = lerFiltrosIniciais(blob.filtrosIniciais, REGRAS_FILTROS);
  const valor = estado == null ? null : coerceEstado(estado, REGRAS_FILTROS[chave]);
  const { [chave]: _, ...resto } = atuais;
  const novos = valor ? { ...resto, [chave]: valor } : resto;
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify({ ...blob, filtrosIniciais: novos }), atualizadoPor: usuarioId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  cache = null;
  return valor;
}
